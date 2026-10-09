import { Injectable, Logger, BadRequestException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '@prisma/client';
import { normalizeMarketingPhone } from '../../common/utils/marketing-opt-out.util';
import { CampaignDispatcherService } from './campaign-dispatcher.service';

export interface CreateCampaignDto {
  name: string;
  type?: 'whatsapp_message' | 'whatsapp_status';
  objective?: string;
  messageTemplate: string;
  mediaUrl?: string;
  mediaType?: string;
  segmentRules?: {
    minOrders?: number;
    maxOrders?: number;
    minSpent?: number;
    daysSinceLastOrder?: number;
    specificCustomers?: string[]; // IDs
  };
  scheduledAt?: Date;
  maxDispatches?: number;
}

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger('CampaignsService');

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly campaignDispatcher?: CampaignDispatcherService,
  ) {}

  /**
   * Cria uma nova campanha e calcula a audiência inicial baseada nas regras de segmentação.
   */
  async createCampaign(tenantId: string, dto: CreateCampaignDto) {
    const isStatus = dto.type === 'whatsapp_status';

    if (isStatus && process.env.FEATURE_WHATSAPP_STATUS_CAMPAIGNS !== 'true') {
      throw new BadRequestException('Campanha de Status do WhatsApp está desativada.');
    }

    let finalAudienceIds: string[] = [];

    if (!isStatus) {
      // 1. Encontra clientes que batem com as regras (e não estão em opt-out)
      const audienceIds = await this.calculateAudience(tenantId, dto.segmentRules ?? {});

      // Limit audience by maxDispatches
      finalAudienceIds = dto.maxDispatches 
        ? audienceIds.slice(0, dto.maxDispatches) 
        : audienceIds;

      if (finalAudienceIds.length === 0) {
        throw new BadRequestException('Nenhum cliente atende aos critérios de segmentação desta campanha.');
      }
    }

    // 2. Cria a campanha
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : undefined;
    const campaign = await this.prisma.campaign.create({
      data: {
        tenantId,
        name: dto.name,
        type: dto.type || 'whatsapp_message',
        objective: dto.objective,
        messageTemplate: dto.messageTemplate,
        mediaUrl: dto.mediaUrl,
        mediaType: dto.mediaType,
        segmentRules: (dto.segmentRules ?? {}) as Prisma.JsonObject,
        scheduledAt,
        status: scheduledAt && scheduledAt > new Date() ? 'scheduled' : 'draft',
        totalAudience: finalAudienceIds.length,
        maxDispatches: dto.maxDispatches || 500,
      },
    });

    if (!isStatus) {
      // 3. Cria os dispatches em massa (status: queued)
      const dispatchesData = finalAudienceIds.map(customerId => {
        const id = randomUUID();
        return {
          id,
          campaignId: campaign.id,
          customerId,
          phone: '', // Preencheremos na query abaixo
          status: 'queued' as const,
          idempotencyKey: `campaign:${campaign.id}:dispatch:${id}`,
        };
      });

      // Buscar os telefones para gravar no dispatch
      const customers = await this.prisma.customer.findMany({
        where: { tenantId, id: { in: finalAudienceIds } },
        select: { id: true, phone: true },
      });

      const phoneMap = new Map(customers.map(c => [c.id, c.phone]));
      dispatchesData.forEach(d => {
        d.phone = phoneMap.get(d.customerId) || '';
      });

      await this.prisma.campaignDispatch.createMany({
        data: dispatchesData,
        skipDuplicates: true,
      });

      this.logger.log(`Campaign ${campaign.id} created with ${finalAudienceIds.length} queued dispatches.`);
    } else {
      this.logger.log(`Status Campaign ${campaign.id} created.`);
    }
    
    return campaign;
  }

  /**
   * Inicia a execução de uma campanha e a torna visível ao dispatcher.
   */
  async startCampaign(tenantId: string, campaignId: string) {
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, tenantId },
    });

    if (!campaign) {
      throw new BadRequestException('Campanha não encontrada.');
    }

    if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
      throw new BadRequestException(`Campanha não pode ser iniciada. Status atual: ${campaign.status}`);
    }

    if (!this.campaignDispatcher) {
      throw new ServiceUnavailableException('Fila de campanhas indisponível. Tente novamente quando BullMQ/Redis estiver disponível.');
    }
    try {
      await this.campaignDispatcher.assertAvailable();
    } catch {
      throw new ServiceUnavailableException('Fila de campanhas indisponível. A campanha não foi iniciada.');
    }

    return this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'processing',
        startedAt: new Date(),
      },
    });
  }

  async startDueScheduledCampaigns(tenantId?: string) {
    const now = new Date();
    const dueCampaigns = await this.prisma.campaign.findMany({
      where: {
        ...(tenantId ? { tenantId } : {}),
        status: 'scheduled',
        scheduledAt: { lte: now },
      },
      select: { id: true, tenantId: true },
      take: 100,
    });

    for (const campaign of dueCampaigns) {
      await this.startCampaign(campaign.tenantId, campaign.id);
    }

    return { started: dueCampaigns.length };
  }

  /**
   * Pausar campanhas não é suportado, as campanhas podem ser apenas canceladas.
   */
  async pauseCampaign(_tenantId: string, _campaignId: string) {
    throw new BadRequestException('A ação de pausar campanhas não é mais suportada nesta versão. Use cancelar.');
  }

  /**
   * Cancela uma campanha.
   */
  async cancelCampaign(tenantId: string, campaignId: string) {
    const cancelled = await this.prisma.campaign.updateMany({
      where: { id: campaignId, tenantId, status: { in: ['draft', 'scheduled', 'processing', 'queued'] } },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });
    if (cancelled.count > 0) {
      await this.prisma.campaignDispatch.updateMany({
        where: { campaignId, campaign: { tenantId }, status: { in: ['queued', 'processing'] } },
        data: { status: 'cancelled', failReason: 'Campaign cancelled before delivery.' },
      });
    }
    return cancelled;
  }

  /**
   * Retorna os detalhes e métricas da campanha.
   */
  async getCampaignDetails(tenantId: string, campaignId: string) {
    return this.prisma.campaign.findFirst({
      where: { id: campaignId, tenantId },
      include: {
        dispatches: {
          take: 50, // Limitado para não estourar a resposta
          orderBy: { createdAt: 'desc' },
          include: {
            customer: { select: { name: true } }
          }
        }
      }
    });
  }

  /**
   * Lista campanhas do tenant
   */
  async listCampaigns(tenantId: string) {
    return this.prisma.campaign.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getAutomationCenter(tenantId: string) {
    const campaigns = await this.prisma.campaign.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        _count: {
          select: {
            dispatches: {
              where: { status: 'failed' },
            },
          },
        },
      },
    });

    const active = campaigns.filter((campaign) => campaign.status === 'processing' || campaign.status === 'scheduled');
    const queued = campaigns.filter((campaign) => campaign.status === 'queued');
    const lastExecutions = campaigns
      .filter((campaign) => campaign.startedAt || campaign.completedAt)
      .slice(0, 10)
      .map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        objective: campaign.objective,
        status: campaign.status,
        startedAt: campaign.startedAt,
        completedAt: campaign.completedAt,
        sent: campaign.totalSent,
        converted: campaign.totalConverted,
      }));

    const totals = campaigns.reduce(
      (acc, campaign) => ({
        sent: acc.sent + campaign.totalSent,
        delivered: acc.delivered + campaign.totalDelivered,
        read: acc.read + campaign.totalRead,
        clicked: acc.clicked + campaign.totalClicked,
        converted: acc.converted + campaign.totalConverted,
        optOuts: acc.optOuts + campaign.totalOptOut,
        failures: acc.failures + campaign._count.dispatches,
        revenueGenerated: acc.revenueGenerated + Number(campaign.revenueGenerated),
      }),
      { sent: 0, delivered: 0, read: 0, clicked: 0, converted: 0, optOuts: 0, failures: 0, revenueGenerated: 0 },
    );

    return { active, queued, lastExecutions, totals };
  }

  async markConversionsFromOrders(tenantId: string, lookbackDays = 7) {
    const since = new Date();
    since.setDate(since.getDate() - lookbackDays);

    const orders = await this.prisma.order.findMany({
      where: { tenantId, status: 'completed', customerId: { not: null }, createdAt: { gte: since } },
      select: { id: true, customerId: true, total: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    let converted = 0;
    let revenueGenerated = 0;

    for (const order of orders) {
      if (!order.customerId) continue;
      const dispatch = await this.prisma.campaignDispatch.findFirst({
        where: {
          customerId: order.customerId,
          convertedAt: null,
          sentAt: { not: null, lte: order.createdAt, gte: since },
          campaign: { tenantId },
        },
        orderBy: { sentAt: 'desc' },
        select: { id: true, campaignId: true },
      });

      if (!dispatch) continue;

      const revenue = Number(order.total);
      await this.prisma.$transaction([
        this.prisma.campaignDispatch.update({
          where: { id: dispatch.id },
          data: { convertedAt: order.createdAt, revenueGenerated: revenue },
        }),
        this.prisma.campaign.update({
          where: { id: dispatch.campaignId },
          data: { totalConverted: { increment: 1 }, revenueGenerated: { increment: revenue } },
        }),
      ]);
      converted += 1;
      revenueGenerated += revenue;
    }

    return { converted, revenueGenerated };
  }

  /**
   * Estima o tamanho do público sem criar a campanha
   */
  async estimateAudience(tenantId: string, rules: CreateCampaignDto['segmentRules']) {
    const audienceIds = await this.calculateAudience(tenantId, rules);
    return {
      estimatedAudience: audienceIds.length,
    };
  }

  /**
   * Lógica interna para filtrar clientes com base nas regras.
   */
  private async calculateAudience(tenantId: string, rules: CreateCampaignDto['segmentRules']): Promise<string[]> {
    const optedOutCustomers = await this.prisma.customerOptOut.findMany({
      where: { tenantId },
      select: { customerId: true, phone: true },
    });
    const optedOutCustomerIds = optedOutCustomers
      .map((optOut) => optOut.customerId)
      .filter((customerId): customerId is string => Boolean(customerId));
    const optedOutPhones = optedOutCustomers.map((optOut) => normalizeMarketingPhone(optOut.phone));

    const whereClause: Prisma.CustomerWhereInput = {
      tenantId,
      id: { notIn: optedOutCustomerIds },
    };

    if (optedOutPhones.length > 0) {
      whereClause.phone = { notIn: optedOutPhones };
    }

    if (rules.specificCustomers && rules.specificCustomers.length > 0) {
      whereClause.id = { in: rules.specificCustomers, notIn: optedOutCustomerIds };
    } else {
      if (rules.minOrders !== undefined) {
        whereClause.totalOrders = { gte: rules.minOrders };
      }
      if (rules.maxOrders !== undefined) {
        whereClause.totalOrders = { 
          ...(typeof whereClause.totalOrders === 'object' ? whereClause.totalOrders : {}), 
          lte: rules.maxOrders 
        };
      }
      if (rules.minSpent !== undefined) {
        whereClause.totalSpent = { gte: rules.minSpent };
      }
      if (rules.daysSinceLastOrder !== undefined) {
        const dateLimit = new Date();
        dateLimit.setDate(dateLimit.getDate() - rules.daysSinceLastOrder);
        whereClause.lastOrderDate = { lte: dateLimit };
      }
    }

    const customers = await this.prisma.customer.findMany({
      where: whereClause,
      select: { id: true },
    });

    return customers.map(c => c.id);
  }
}
