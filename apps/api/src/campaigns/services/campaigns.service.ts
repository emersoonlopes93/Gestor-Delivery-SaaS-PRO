import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CampaignStatus, Prisma } from '@prisma/client';

export interface CreateCampaignDto {
  name: string;
  objective?: string;
  messageTemplate: string;
  mediaUrl?: string;
  segmentRules: {
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

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cria uma nova campanha e calcula a audiência inicial baseada nas regras de segmentação.
   */
  async createCampaign(tenantId: string, dto: CreateCampaignDto) {
    // 1. Encontra clientes que batem com as regras (e não estão em opt-out)
    const audienceIds = await this.calculateAudience(tenantId, dto.segmentRules);

    // Limit audience by maxDispatches
    const finalAudienceIds = dto.maxDispatches 
      ? audienceIds.slice(0, dto.maxDispatches) 
      : audienceIds;

    if (finalAudienceIds.length === 0) {
      throw new BadRequestException('Nenhum cliente atende aos critérios de segmentação desta campanha.');
    }

    // 2. Cria a campanha
    const campaign = await this.prisma.campaign.create({
      data: {
        tenantId,
        name: dto.name,
        objective: dto.objective,
        messageTemplate: dto.messageTemplate,
        mediaUrl: dto.mediaUrl,
        segmentRules: dto.segmentRules as Prisma.JsonObject,
        scheduledAt: dto.scheduledAt,
        status: 'draft',
        totalAudience: finalAudienceIds.length,
        maxDispatches: dto.maxDispatches || 500,
      },
    });

    // 3. Cria os dispatches em massa (status: queued)
    const dispatchesData = finalAudienceIds.map(customerId => ({
      campaignId: campaign.id,
      customerId: customerId,
      phone: '', // Preencheremos na query abaixo
      status: 'queued' as const,
    }));

    // Buscar os telefones para gravar no dispatch
    const customers = await this.prisma.customer.findMany({
      where: { id: { in: finalAudienceIds } },
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
    return campaign;
  }

  /**
   * Inicia a execução de uma campanha (muda status de draft/scheduled para running).
   * O CampaignDispatcherService deverá varrer campanhas 'running' para enviar.
   */
  async startCampaign(tenantId: string, campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign || campaign.tenantId !== tenantId) {
      throw new BadRequestException('Campanha não encontrada.');
    }

    if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
      throw new BadRequestException(`Campanha não pode ser iniciada. Status atual: ${campaign.status}`);
    }

    return this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'running',
        startedAt: new Date(),
      },
    });
  }

  /**
   * Pausa uma campanha em execução.
   */
  async pauseCampaign(tenantId: string, campaignId: string) {
    return this.prisma.campaign.updateMany({
      where: { id: campaignId, tenantId, status: 'running' },
      data: { status: 'paused' },
    });
  }

  /**
   * Cancela uma campanha.
   */
  async cancelCampaign(tenantId: string, campaignId: string) {
    return this.prisma.campaign.updateMany({
      where: { id: campaignId, tenantId, status: { in: ['draft', 'scheduled', 'running', 'paused'] } },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });
  }

  /**
   * Retorna os detalhes e métricas da campanha.
   */
  async getCampaignDetails(tenantId: string, campaignId: string) {
    return this.prisma.campaign.findUnique({
      where: { id: campaignId },
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

  /**
   * Lógica interna para filtrar clientes com base nas regras.
   */
  private async calculateAudience(tenantId: string, rules: CreateCampaignDto['segmentRules']): Promise<string[]> {
    const whereClause: Prisma.CustomerWhereInput = {
      tenantId,
      // Não incluir quem fez opt-out
      optOuts: { none: {} },
    };

    if (rules.specificCustomers && rules.specificCustomers.length > 0) {
      whereClause.id = { in: rules.specificCustomers };
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
