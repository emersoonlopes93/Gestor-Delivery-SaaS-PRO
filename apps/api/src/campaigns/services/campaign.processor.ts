import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppSenderService } from '../../whatsapp-channel/services/whatsapp-sender.service';

export interface CampaignJobData {
  campaignId: string;
  dispatchId: string;
  tenantId: string;
  phone: string;
  customerName: string;
  messageTemplate: string;
  mediaUrl?: string | null;
}

@Processor('campaign-dispatch')
export class CampaignProcessor extends WorkerHost {
  private readonly logger = new Logger(CampaignProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappSender: WhatsAppSenderService,
  ) {
    super();
  }

  async process(job: Job<CampaignJobData, { success: boolean; messageId?: string; skipped?: boolean; reason?: string }, string>): Promise<{ success: boolean; messageId?: string; skipped?: boolean; reason?: string }> {
    const { campaignId, dispatchId, tenantId, phone, customerName, messageTemplate, mediaUrl } = job.data;

    this.logger.log(`Processing campaign dispatch ${dispatchId} for phone ${phone}`);

    // 1. Check for Opt-Out (Feature critical for Anti-Ban)
    const optOut = await this.prisma.customerOptOut.findUnique({
      where: {
        tenantId_phone: {
          tenantId,
          phone,
        },
      },
    });

    if (optOut) {
      this.logger.warn(`Customer ${phone} has opted out. Skipping dispatch.`);
      await this.prisma.campaignDispatch.update({
        where: { id: dispatchId },
        data: { 
          status: 'failed', 
          failReason: 'Opt-out: Cliente solicitou não receber mensagens.' 
        },
      });
      return { success: false, skipped: true, reason: 'opt-out' };
    }

    // 2. Personalize Message
    const personalizedMessage = messageTemplate.replace(
      /{{nome}}/gi,
      customerName.split(' ')[0],
    );

    try {
      let result;

      if (mediaUrl) {
        result = await this.whatsappSender.sendMedia(tenantId, {
          to: phone,
          type: 'image',
          url: mediaUrl,
          caption: personalizedMessage,
        });
      } else {
        result = await this.whatsappSender.sendText(tenantId, {
          to: phone,
          text: personalizedMessage,
        });
      }

      // 3. Update Status
      const status = result.success ? 'sent' : 'failed';
      
      await this.prisma.campaignDispatch.update({
        where: { id: dispatchId },
        data: {
          status,
          externalId: result.messageId,
          failReason: result.error,
          sentAt: result.success ? new Date() : null,
        },
      });

      if (result.success) {
        await this.prisma.campaign.update({
          where: { id: campaignId },
          data: { totalSent: { increment: 1 } },
        });

        // Registrar na inbox (chat) como outbound, para ficar sincronizado com a caixa de entrada
        const session = await this.prisma.chatSession.upsert({
          where: {
            tenantId_customerPhone: { tenantId, customerPhone: phone },
          },
          create: {
            tenantId,
            customerPhone: phone,
            state: 'greeting',
            lastMessageAt: new Date(),
          },
          update: {
            lastMessageAt: new Date(),
          },
        });

        await this.prisma.chatMessage.create({
          data: {
            sessionId: session.id,
            direction: 'outbound',
            content: mediaUrl ? `${personalizedMessage}` : personalizedMessage,
            messageType: 'text',
            externalId: result.messageId || undefined,
            metadata: {
              source: 'campaign',
              campaignId,
              dispatchId,
              hasMedia: Boolean(mediaUrl),
            },
          },
        });
      }

      return { success: result.success, messageId: result.messageId };

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error processing dispatch ${dispatchId}: ${message}`);
      
      await this.prisma.campaignDispatch.update({
        where: { id: dispatchId },
        data: {
          status: 'failed',
          failReason: message,
        },
      });

      throw error;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`);
  }
}
