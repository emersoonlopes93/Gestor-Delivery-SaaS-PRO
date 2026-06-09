import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { CampaignsService } from './campaigns.service';

const RECOVERY_MESSAGES: Record<30 | 60 | 90, string> = {
  30: 'Sentimos sua falta. Que tal aproveitar uma condicao especial hoje?',
  60: 'Faz tempo que voce nao pede com a gente. Hoje preparamos uma oferta especial para voce voltar.',
  90: 'Queremos reconquistar voce. Volte hoje e aproveite uma campanha exclusiva de reativacao.',
};

@Injectable()
export class RecoveryCampaignService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campaignsService: CampaignsService,
  ) {}

  async preview(tenantId: string) {
    const [inactive30, inactive60, inactive90] = await Promise.all([
      this.countAudience(tenantId, 30),
      this.countAudience(tenantId, 60),
      this.countAudience(tenantId, 90),
    ]);

    return [
      { days: 30, audience: inactive30, message: RECOVERY_MESSAGES[30] },
      { days: 60, audience: inactive60, message: RECOVERY_MESSAGES[60] },
      { days: 90, audience: inactive90, message: RECOVERY_MESSAGES[90] },
    ];
  }

  async createRecoveryCampaign(tenantId: string, days: 30 | 60 | 90) {
    const campaign = await this.campaignsService.createCampaign(tenantId, {
      name: `Recuperacao ${days} dias`,
      objective: `recovery_${days}`,
      messageTemplate: RECOVERY_MESSAGES[days],
      segmentRules: { daysSinceLastOrder: days },
      maxDispatches: days === 30 ? 300 : days === 60 ? 200 : 100,
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userType: 'system',
        action: 'recovery_campaign_created',
        resource: 'campaign',
        details: { campaignId: campaign.id, days } as Prisma.JsonObject,
      },
    });

    return campaign;
  }

  private async countAudience(tenantId: string, days: number) {
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - days);
    const optedOutCustomers = await this.prisma.customerOptOut.findMany({
      where: { tenantId },
      select: { customerId: true },
    });

    return this.prisma.customer.count({
      where: {
        tenantId,
        lastOrderDate: { lte: dateLimit },
        id: { notIn: optedOutCustomers.map((optOut) => optOut.customerId) },
      },
    });
  }
}
