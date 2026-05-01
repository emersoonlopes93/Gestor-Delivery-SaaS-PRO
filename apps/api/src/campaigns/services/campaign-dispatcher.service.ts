import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppSenderService } from '../../whatsapp-channel/services/whatsapp-sender.service';
import { CampaignDispatchStatus } from '@prisma/client';

@Injectable()
export class CampaignDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('CampaignDispatcherService');
  private isProcessing = false;
  private intervalId?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappSender: WhatsAppSenderService,
  ) {}

  onModuleInit() {
    this.logger.log('Inicializando dispatcher de campanhas (setInterval)...');
    // Roda a cada 30 segundos
    this.intervalId = setInterval(() => {
      this.processQueuedDispatches();
    }, 30000);
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  /**
   * Método que deve ser chamado via Cron Job (ex: a cada 1 minuto) ou Worker (BullMQ).
   * Para o MVP, este método varre a tabela de dispatches e envia as mensagens.
   */
  async processQueuedDispatches() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // 1. Busca campanhas que estão rodando
      const runningCampaigns = await this.prisma.campaign.findMany({
        where: { status: 'running' },
        select: { id: true, tenantId: true, messageTemplate: true, mediaUrl: true },
      });

      if (runningCampaigns.length === 0) {
        this.isProcessing = false;
        return;
      }

      for (const campaign of runningCampaigns) {
        // Pega um lote de clientes para não estourar o rate limit
        // O rate limiting ideal seria controlado por Redis (Token Bucket)
        // Aqui pegamos 10 mensagens por vez por campanha para evitar bloqueio.
        const batch = await this.prisma.campaignDispatch.findMany({
          where: {
            campaignId: campaign.id,
            status: 'queued',
          },
          take: 10,
          include: { customer: { select: { name: true } } },
        });

        if (batch.length === 0) {
          // Se não tem mais nada na fila, conclui a campanha
          await this.prisma.campaign.update({
            where: { id: campaign.id },
            data: { status: 'completed', completedAt: new Date() },
          });
          this.logger.log(`Campaign ${campaign.id} completed.`);
          continue;
        }

        // 3. Dispara as mensagens
        for (const dispatch of batch) {
          try {
            // Personaliza a mensagem (ex: troca {{nome}} pelo nome do cliente)
            const personalizedMessage = campaign.messageTemplate.replace(
              /{{nome}}/gi,
              dispatch.customer.name.split(' ')[0], // Primeiro nome
            );

            let result;

            if (campaign.mediaUrl) {
              // Assume imagem para o MVP, pode ser aprimorado inferindo a extensão
              result = await this.whatsappSender.sendMedia(campaign.tenantId, {
                to: dispatch.phone,
                type: 'image',
                url: campaign.mediaUrl,
                caption: personalizedMessage,
              });
            } else {
              result = await this.whatsappSender.sendText(campaign.tenantId, {
                to: dispatch.phone,
                text: personalizedMessage,
              });
            }

            // Atualiza status do dispatch
            const status: CampaignDispatchStatus = result.success ? 'sent' : 'failed';
            
            await this.prisma.campaignDispatch.update({
              where: { id: dispatch.id },
              data: {
                status,
                externalId: result.messageId,
                failReason: result.error,
                sentAt: result.success ? new Date() : null,
              },
            });

            // Incrementa contadores na campanha
            await this.prisma.campaign.update({
              where: { id: campaign.id },
              data: {
                totalSent: result.success ? { increment: 1 } : undefined,
              },
            });

            // Delay de proteção entre mensagens (anti-ban)
            await this.sleep(2000); 

          } catch (error: any) {
            this.logger.error(`Failed to send dispatch ${dispatch.id}: ${error.message}`);
            await this.prisma.campaignDispatch.update({
              where: { id: dispatch.id },
              data: { status: 'failed', failReason: error.message },
            });
          }
        }
      }
    } catch (error: any) {
      this.logger.error(`Error in processQueuedDispatches: ${error.message}`);
    } finally {
      this.isProcessing = false;
    }
  }

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
