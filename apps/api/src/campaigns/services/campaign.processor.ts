import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppSenderService } from '../../whatsapp-channel/services/whatsapp-sender.service';
import { CampaignDispatcherService } from './campaign-dispatcher.service';
import { CampaignAutomationService } from './campaign-automation.service';

export interface CampaignJobData {
  campaignId?: string;
  dispatchId?: string;
  tenantId?: string;
  customerId?: string;
  phone?: string;
  customerName?: string;
  messageTemplate?: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  isStatus?: boolean;
  isSystemJob?: boolean;
}

@Processor('campaign-dispatch')
export class CampaignProcessor extends WorkerHost {
  private readonly logger = new Logger(CampaignProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappSender: WhatsAppSenderService,
    private readonly campaignDispatcher: CampaignDispatcherService,
    private readonly campaignAutomationService: CampaignAutomationService,
  ) {
    super();
  }

  async process(
    job: Job<CampaignJobData, { success: boolean; messageId?: string; skipped?: boolean; reason?: string }, string>,
  ): Promise<{ success: boolean; messageId?: string; skipped?: boolean; reason?: string }> {
    if (job.name === 'system-feed-queue') {
      this.logger.log('Processing system-feed-queue job...');
      await this.campaignDispatcher.feedQueue();
      return { success: true };
    }

    if (job.name === 'system-automation-scan') {
      this.logger.log('Processing system-automation-scan job...');
      await this.campaignAutomationService.runAllTenants();
      return { success: true };
    }

    // A partir daqui, esperamos que seja um job de campanha (status ou dispatch)
    const { campaignId, dispatchId, tenantId, customerId, phone, customerName, messageTemplate, mediaUrl, mediaType, isStatus } = job.data;
    
    if (!campaignId || !tenantId) {
      throw new Error(`Invalid job data: missing campaignId or tenantId for job ${job.id}`);
    }

    if (isStatus) {
      this.logger.log(`Processing status campaign ${campaignId}`);
      try {
        const result = await this.whatsappSender.publishStatus(tenantId, {
          text: messageTemplate!,
          mediaUrl: mediaUrl || undefined,
          mediaType: mediaType || undefined,
          caption: messageTemplate!,
        });
        
        await this.prisma.campaign.update({
          where: { id: campaignId },
          data: { status: result.success ? 'completed' : 'cancelled' },
        });

        return { success: result.success, messageId: result.messageId };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Error processing status campaign ${campaignId}: ${message}`);
        await this.prisma.campaign.update({
          where: { id: campaignId },
          data: { status: 'cancelled' },
        });
        throw error;
      }
    }

    if (!dispatchId || !customerId || !phone || !customerName || !messageTemplate) {
      throw new Error(`Invalid job data: missing required dispatch fields for job ${job.id}`);
    }

    this.logger.log(`Processing campaign dispatch ${dispatchId} for phone ${phone}`);

    const optOut = await this.prisma.customerOptOut.findUnique({
      where: { tenantId_phone: { tenantId, phone } },
    });

    if (optOut) {
      this.logger.warn(`Customer ${phone} has opted out. Skipping dispatch.`);
      await this.prisma.campaignDispatch.update({
        where: { id: dispatchId },
        data: {
          status: 'opt_out',
          failReason: 'Opt-out: cliente solicitou nao receber mensagens.',
        },
      });
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { totalOptOut: { increment: 1 } },
      });
      return { success: false, skipped: true, reason: 'opt-out' };
    }

    const antiSpam = await this.checkAntiSpam(tenantId, customerId, dispatchId);
    if (!antiSpam.allowed) {
      if (antiSpam.reason.startsWith('outside_quiet_hours')) {
        // Reagendar: reverter para queued para ser reprocessado no próximo ciclo do feedQueue (a cada 60s)
        // O dispatch não é perdido — será enviado quando a janela de 08h-21h (America/Sao_Paulo) abrir
        await this.prisma.campaignDispatch.update({
          where: { id: dispatchId },
          data: { status: 'queued', failReason: null },
        });
        this.logger.warn(
          `rescheduled_due_to_quiet_hours dispatchId=${dispatchId} tenantId=${tenantId} — aguardando janela 08h-21h (America/Sao_Paulo)`,
        );
        return { success: false, skipped: true, reason: 'rescheduled_quiet_hours' };
      }
      // Demais motivos de anti-spam (cooldown, max_frequency) → falha definitiva para este ciclo
      this.logger.warn(`Dispatch ${dispatchId} skipped due to anti-spam: ${antiSpam.reason}`);
      await this.prisma.campaignDispatch.update({
        where: { id: dispatchId },
        data: { status: 'failed', failReason: antiSpam.reason },
      });
      return { success: false, skipped: true, reason: antiSpam.reason };
    }

    const firstName = customerName.trim().split(' ')[0] || 'cliente';
    const personalizedMessage = messageTemplate.replace(/{{nome}}/gi, firstName);

    // Jitter/Delay aleatório para evitar banimento do WhatsApp (Anti-Spam)
    // Entre 5000ms e 15000ms
    const jitterMs = Math.floor(Math.random() * (15000 - 5000 + 1)) + 5000;
    this.logger.log(`Aguardando ${jitterMs}ms antes de enviar para ${phone}...`);
    await new Promise(resolve => setTimeout(resolve, jitterMs));

    try {
      const result = mediaUrl
        ? await this.whatsappSender.sendMedia(tenantId, {
            to: phone,
            type: 'image',
            url: mediaUrl,
            caption: personalizedMessage,
          })
        : await this.whatsappSender.sendText(tenantId, {
            to: phone,
            text: personalizedMessage,
          });

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

        let session = await this.prisma.chatSession.findFirst({
          where: {
            tenantId,
            customerPhone: phone,
            state: { notIn: ['closed', 'expired'] },
          },
          orderBy: { updatedAt: 'desc' },
        });

        if (!session) {
          session = await this.prisma.chatSession.create({
            data: {
              tenantId,
              customerId,
              customerPhone: phone,
              state: 'greeting',
              lastMessageAt: new Date(),
            },
          });
        }

        await this.prisma.chatMessage.create({
          data: {
            sessionId: session.id,
            direction: 'outbound',
            senderType: 'human',
            content: personalizedMessage,
            messageType: 'text',
            externalId: result.messageId || undefined,
            externalStatus: result.success ? 'sent' : 'failed',
            timestamp: new Date(),
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

  private async checkAntiSpam(tenantId: string, customerId: string, dispatchId: string) {
    // Verificacao de janela de silencio central (08:00 - 21:00)
    // TODO P1-TECH: buscar tenantSettings.timezone para suportar múltiplos fusos horários.
    // Por enquanto, America/Sao_Paulo como fallback — impacto zero para tenants brasileiros.
    // Quando implementado: const tz = (await prisma.tenantSettings.findUnique(...))?.timezone ?? 'America/Sao_Paulo';
    const hourFormatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo', // TODO P1-TECH: substituir por tenantSettings.timezone
      hour: 'numeric',
      hour12: false,
    });

    try {
      const currentHour = parseInt(hourFormatter.format(new Date()), 10);
      if (currentHour < 8 || currentHour >= 21) {
        return { allowed: false, reason: 'outside_quiet_hours - Horário não permitido (Silêncio Noturno)' };
      }
    } catch (e) {
      this.logger.error('Failed to parse timezone hour, falling back to local system hour', e);
      const currentHour = new Date().getHours();
      if (currentHour < 8 || currentHour >= 21) {
        return { allowed: false, reason: 'outside_quiet_hours - Horário não permitido (Silêncio Noturno)' };
      }
    }

    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { automationCooldownHours: true, automationMaxMessagesPerDay: true },
    });
    const cooldownHours = settings?.automationCooldownHours ?? 24;
    const maxPerDay = settings?.automationMaxMessagesPerDay ?? 1;
    const cooldownSince = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);
    const daySince = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [recentSent, sentToday] = await Promise.all([
      this.prisma.campaignDispatch.findFirst({
        where: {
          customerId,
          id: { not: dispatchId },
          status: { in: ['sent', 'delivered', 'read', 'replied'] },
          sentAt: { gte: cooldownSince },
          campaign: { tenantId },
        },
        select: { id: true },
      }),
      this.prisma.campaignDispatch.count({
        where: {
          customerId,
          id: { not: dispatchId },
          status: { in: ['sent', 'delivered', 'read', 'replied'] },
          sentAt: { gte: daySince },
          campaign: { tenantId },
        },
      }),
    ]);

    if (recentSent) return { allowed: false, reason: `cooldown_${cooldownHours}h` };
    if (sentToday >= maxPerDay) return { allowed: false, reason: `max_frequency_${maxPerDay}_per_day` };
    return { allowed: true };
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`);
  }
}
