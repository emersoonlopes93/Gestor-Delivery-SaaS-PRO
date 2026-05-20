import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CampaignJobData } from './campaign.processor';

@Injectable()
export class CampaignDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('CampaignDispatcherService');
  private intervalId?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('campaign-dispatch') private readonly campaignQueue: Queue,
  ) {}

  onModuleInit() {
    this.logger.log('Inicializando alimentador de fila de campanhas (BullMQ)...');
    // Roda a cada 1 minuto para carregar novos lotes para a fila
    this.intervalId = setInterval(() => {
      this.feedQueue();
    }, 60000);
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  /**
   * Varre campanhas 'running' e move dispatches 'queued' para o BullMQ
   */
  async feedQueue() {
    try {
      const runningCampaigns = await this.prisma.campaign.findMany({
        where: { status: 'running' },
        select: { 
          id: true, 
          tenantId: true, 
          messageTemplate: true, 
          mediaUrl: true 
        },
      });

      if (runningCampaigns.length === 0) return;

      for (const campaign of runningCampaigns) {
        // Pega mensagens pendentes que ainda não foram enviadas para o BullMQ
        // Usamos status 'queued' e mudamos para 'processing' ao adicionar na fila Bull
        const dispatches = await this.prisma.campaignDispatch.findMany({
          where: {
            campaignId: campaign.id,
            status: 'queued',
          },
          take: 50, // Lote maior para alimentar a fila
          include: { 
            customer: { select: { name: true } } 
          },
        });

        if (dispatches.length === 0) {
          // Verifica se ainda existem mensagens com status 'queued' ou 'failed' (que poderiam ser re-tentadas se quiséssemos)
          // Se não tem nada mesmo, conclui
          const pendingCount = await this.prisma.campaignDispatch.count({
            where: { campaignId: campaign.id, status: 'queued' }
          });

          if (pendingCount === 0) {
            await this.prisma.campaign.update({
              where: { id: campaign.id },
              data: { status: 'completed', completedAt: new Date() },
            });
            this.logger.log(`Campaign ${campaign.id} marked as completed.`);
          }
          continue;
        }

        // Adiciona na fila BullMQ
        for (const dispatch of dispatches) {
          const jobData: CampaignJobData = {
            campaignId: campaign.id,
            dispatchId: dispatch.id,
            tenantId: campaign.tenantId,
            phone: dispatch.phone,
            customerName: dispatch.customer.name,
            messageTemplate: campaign.messageTemplate,
            mediaUrl: campaign.mediaUrl,
          };

          await this.campaignQueue.add('dispatch-job', jobData, {
            jobId: `dispatch-${dispatch.id}`, // Idempotência na fila
          });

          // Marcamos como 'processing' para não pegar de novo no próximo feedQueue
          // Se o worker falhar, ele atualiza para 'failed' ou tenta de novo via BullMQ
          // 'processing' aqui significa 'entregue ao sistema de filas'
          await this.prisma.campaignDispatch.update({
            where: { id: dispatch.id },
            data: { status: 'processing' }
          });
        }
        
        this.logger.log(`Added ${dispatches.length} jobs to queue for campaign ${campaign.id}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error in feedQueue: ${message}`);
    }
  }
}
