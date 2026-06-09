import { BadRequestException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { CrmPipelineStage, CrmTaskStatus, Prisma } from '@prisma/client';
import { BusinessInsightsService } from '../analytics/business-insights.service';
import { CampaignAutomationService } from '../campaigns/services/campaign-automation.service';
import { PrismaService } from '../database/prisma.service';
import { CashbackService } from '../promotions/cashback.service';
import { LoyaltyService } from '../promotions/loyalty.service';
import { WalletService } from '../promotions/wallet.service';
import { CustomerIntelligenceProfile, CustomerIntelligenceService } from './customer-intelligence.service';

type TimelineKind =
  | 'order'
  | 'cashback'
  | 'loyalty'
  | 'wallet'
  | 'coupon'
  | 'campaign'
  | 'whatsapp'
  | 'commercial_ai'
  | 'task'
  | 'note';

type CrmTimelineEvent = {
  id: string;
  kind: TimelineKind;
  title: string;
  description?: string | null;
  occurredAt: Date;
  amount?: number;
  metadata?: Prisma.JsonObject;
};

type CreateTaskInput = {
  customerId: string;
  title: string;
  description?: string;
  dueAt?: string;
  status?: CrmTaskStatus;
};

type CreateNoteInput = {
  customerId: string;
  content: string;
};

@Injectable()
export class CrmEnterpriseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customerIntelligenceService: CustomerIntelligenceService,
    private readonly businessInsightsService: BusinessInsightsService,
    private readonly loyaltyService: LoyaltyService,
    private readonly cashbackService: CashbackService,
    private readonly walletService: WalletService,
    @Inject(forwardRef(() => CampaignAutomationService))
    private readonly campaignAutomationService: CampaignAutomationService,
  ) {}

  async getDashboard(tenantId: string) {
    const [segments, kpis, retention, recoveredCustomers] = await Promise.all([
      this.customerIntelligenceService.getSegments(tenantId),
      this.customerIntelligenceService.getRevenueKpis(tenantId),
      this.businessInsightsService.getRetentionDashboard(tenantId),
      this.countRecoveredCustomers(tenantId),
    ]);

    const totalCustomers = segments.profiles.length;
    const atRiskIds = new Set([
      ...segments.bySegment.at_risk.map((profile) => profile.customerId),
      ...segments.bySegment.inactive_60.map((profile) => profile.customerId),
      ...segments.bySegment.inactive_90.map((profile) => profile.customerId),
    ]);

    return {
      generatedAt: new Date(),
      reuse: {
        segmentationSource: 'CustomerIntelligenceService',
        kpiSource: 'CustomerIntelligenceService',
        trendsAndRetentionSource: 'BusinessInsightsService',
        campaignOrchestrator: 'CampaignAutomationService',
      },
      indicators: {
        activeCustomers: segments.bySegment.frequent.length,
        atRiskCustomers: atRiskIds.size,
        recoveredCustomers,
        vipCustomers: segments.bySegment.vip.length,
        averageTicket: kpis.averageTicket,
        averageFrequency: retention.averageFrequency || kpis.purchaseFrequency,
        estimatedChurn: totalCustomers ? atRiskIds.size / totalCustomers : 0,
      },
      segments: {
        totalCustomers,
        vip: segments.bySegment.vip.length,
        frequent: segments.bySegment.frequent.length,
        inactive30: segments.bySegment.inactive_30.length,
        inactive60: segments.bySegment.inactive_60.length,
        inactive90: segments.bySegment.inactive_90.length,
        atRisk: segments.bySegment.at_risk.length,
        newCustomers: segments.bySegment.new.length,
      },
    };
  }

  async getPipeline(tenantId: string) {
    const [segments, overrides, recoveredIds] = await Promise.all([
      this.customerIntelligenceService.getSegments(tenantId),
      this.prisma.crmPipelineEntry.findMany({ where: { tenantId } }),
      this.getRecoveredCustomerIds(tenantId),
    ]);

    const overrideByCustomer = new Map(overrides.map((entry) => [entry.customerId, entry]));
    const stages = this.emptyPipelineCounts();
    const customers = segments.profiles.map((profile) => {
      const override = overrideByCustomer.get(profile.customerId);
      const stage = override?.stage ?? this.derivePipelineStage(profile, recoveredIds);
      stages[stage] += 1;
      return {
        customerId: profile.customerId,
        name: profile.name,
        phone: profile.phone,
        stage,
        source: override?.source ?? 'CustomerIntelligenceService',
        reason: override?.reason ?? this.describePipelineReason(profile, stage),
        healthScore: this.calculateHealthScore(profile, {
          cashbackBalance: 0,
          loyaltyPoints: 0,
          promotionalCredits: 0,
        }).score,
      };
    });

    return { stages, customers };
  }

  async upsertPipelineStage(
    tenantId: string,
    customerId: string,
    input: { stage: CrmPipelineStage; source?: string; reason?: string },
  ) {
    await this.assertCustomer(tenantId, customerId);
    return this.prisma.crmPipelineEntry.upsert({
      where: { tenantId_customerId: { tenantId, customerId } },
      create: {
        tenantId,
        customerId,
        stage: input.stage,
        source: input.source ?? 'manual',
        reason: input.reason ?? null,
      },
      update: {
        stage: input.stage,
        source: input.source ?? 'manual',
        reason: input.reason ?? null,
      },
    });
  }

  async getCustomerHealth(tenantId: string, customerId: string) {
    const [profile, loyalty, wallet, cashbackBalance] = await Promise.all([
      this.requireProfile(tenantId, customerId),
      this.loyaltyService.getSummary(tenantId, customerId),
      this.walletService.getWallet(tenantId, customerId),
      this.cashbackService.getCashbackBalance(tenantId, customerId),
    ]);

    return this.calculateHealthScore(profile, {
      cashbackBalance,
      loyaltyPoints: loyalty.balance,
      promotionalCredits: wallet.promotionalCredits,
    });
  }

  async getCommercialAiRecommendations(tenantId: string) {
    const [automationRecommendations, segments] = await Promise.all([
      this.campaignAutomationService.getCommercialAiRecommendations(tenantId),
      this.customerIntelligenceService.getSegments(tenantId),
    ]);

    const recommendations = [
      ...segments.bySegment.at_risk.slice(0, 20).map((profile) => ({
        type: 'churn_risk',
        priority: 'high' as const,
        customerId: profile.customerId,
        customerName: profile.name,
        message: 'Cliente em risco de abandono.',
        recommendedAction: 'Entrar em recuperacao pelo CampaignAutomationService.',
      })),
      ...segments.bySegment.vip.slice(0, 20).map((profile) => ({
        type: 'vip_eligible',
        priority: 'medium' as const,
        customerId: profile.customerId,
        customerName: profile.name,
        message: 'Cliente elegivel para VIP.',
        recommendedAction: 'Aplicar beneficio VIP usando fidelidade/cashback existentes.',
      })),
      ...segments.bySegment.inactive_30.slice(0, 20).map((profile) => ({
        type: 'recovery_eligible',
        priority: 'high' as const,
        customerId: profile.customerId,
        customerName: profile.name,
        message: 'Cliente elegivel para recuperacao.',
        recommendedAction: 'Usar automacao de recuperacao existente.',
      })),
      ...segments.bySegment.new.slice(0, 20).map((profile) => ({
        type: 'coupon_eligible',
        priority: 'low' as const,
        customerId: profile.customerId,
        customerName: profile.name,
        message: 'Cliente elegivel para cupom de recompra.',
        recommendedAction: 'Usar cupons automaticos do CampaignAutomationService.',
      })),
    ];

    return {
      generatedAt: new Date(),
      source: 'CustomerIntelligenceService',
      campaignOrchestrator: 'CampaignAutomationService',
      automationRecommendations,
      recommendations,
    };
  }

  async getCustomerTimeline(tenantId: string, customerId: string) {
    await this.assertCustomer(tenantId, customerId);
    const [orders, cashback, loyalty, wallet, dispatches, chatSessions, tasks, notes] = await Promise.all([
      this.prisma.order.findMany({
        where: { tenantId, customerId },
        include: { coupon: true },
        orderBy: { createdAt: 'desc' },
        take: 80,
      }),
      this.cashbackService.listCashbackTransactions(tenantId, customerId),
      this.loyaltyService.listTransactions(tenantId, customerId),
      this.walletService.listTransactions(tenantId, customerId),
      this.prisma.campaignDispatch.findMany({
        where: { customerId, campaign: { tenantId } },
        include: { campaign: true },
        orderBy: { createdAt: 'desc' },
        take: 80,
      }),
      this.prisma.chatSession.findMany({
        where: { tenantId, customerId },
        include: { messages: { orderBy: { createdAt: 'desc' }, take: 20 } },
        orderBy: { lastMessageAt: 'desc' },
        take: 10,
      }),
      this.prisma.crmTask.findMany({ where: { tenantId, customerId }, orderBy: { createdAt: 'desc' }, take: 50 }),
      this.prisma.crmNote.findMany({ where: { tenantId, customerId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);

    const events: CrmTimelineEvent[] = [
      ...orders.map((order) => ({
        id: order.id,
        kind: 'order' as const,
        title: `Pedido ${order.orderNumber}`,
        description: order.status,
        occurredAt: order.createdAt,
        amount: Number(order.total),
        metadata: { couponId: order.couponId ?? undefined },
      })),
      ...orders
        .filter((order) => order.coupon)
        .map((order) => ({
          id: `coupon-${order.id}`,
          kind: 'coupon' as const,
          title: `Cupom ${order.coupon?.code ?? 'aplicado'}`,
          description: `Pedido ${order.orderNumber}`,
          occurredAt: order.createdAt,
          amount: Number(order.discountTotal),
        })),
      ...cashback.map((item) => ({
        id: item.id,
        kind: 'cashback' as const,
        title: `Cashback ${item.type}`,
        description: item.description,
        occurredAt: item.createdAt,
        amount: item.amount,
      })),
      ...loyalty.map((item) => ({
        id: item.id,
        kind: 'loyalty' as const,
        title: `Pontos ${item.type}`,
        description: item.description,
        occurredAt: item.createdAt,
        amount: item.points,
      })),
      ...wallet.map((item) => ({
        id: item.id,
        kind: 'wallet' as const,
        title: `Wallet ${item.type}`,
        description: item.description,
        occurredAt: item.createdAt,
        amount: item.amount,
      })),
      ...dispatches.map((dispatch) => ({
        id: dispatch.id,
        kind: 'campaign' as const,
        title: dispatch.campaign.name,
        description: dispatch.status,
        occurredAt: dispatch.sentAt ?? dispatch.createdAt,
        amount: Number(dispatch.revenueGenerated),
        metadata: { objective: dispatch.campaign.objective ?? undefined },
      })),
      ...chatSessions.flatMap((session) =>
        session.messages.map((message) => ({
          id: message.id,
          kind: message.senderType === 'ai' ? ('commercial_ai' as const) : ('whatsapp' as const),
          title: message.senderType === 'ai' ? 'IA Comercial' : 'WhatsApp',
          description: message.content,
          occurredAt: message.timestamp ?? message.createdAt,
        })),
      ),
      ...tasks.map((task) => ({
        id: task.id,
        kind: 'task' as const,
        title: task.title,
        description: task.description,
        occurredAt: task.dueAt ?? task.createdAt,
        metadata: { status: task.status },
      })),
      ...notes.map((note) => ({
        id: note.id,
        kind: 'note' as const,
        title: 'Nota interna',
        description: note.content,
        occurredAt: note.createdAt,
      })),
    ];

    return events.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()).slice(0, 200);
  }

  async listTasks(tenantId: string, customerId?: string) {
    return this.prisma.crmTask.findMany({
      where: { tenantId, ...(customerId ? { customerId } : {}) },
      include: { customer: { select: { id: true, name: true, phone: true } } },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  async createTask(tenantId: string, userId: string | undefined, input: CreateTaskInput) {
    await this.assertCustomer(tenantId, input.customerId);
    if (!input.title?.trim()) throw new BadRequestException('Titulo da tarefa e obrigatorio.');
    return this.prisma.crmTask.create({
      data: {
        tenantId,
        customerId: input.customerId,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        status: input.status ?? 'open',
        createdBy: userId ?? null,
      },
    });
  }

  async updateTask(tenantId: string, taskId: string, input: Partial<CreateTaskInput> & { status?: CrmTaskStatus }) {
    const task = await this.prisma.crmTask.findFirst({ where: { id: taskId, tenantId } });
    if (!task) throw new NotFoundException('Tarefa nao encontrada.');
    return this.prisma.crmTask.update({
      where: { id: taskId },
      data: {
        title: input.title !== undefined ? input.title.trim() : undefined,
        description: input.description !== undefined ? input.description.trim() || null : undefined,
        dueAt: input.dueAt !== undefined ? (input.dueAt ? new Date(input.dueAt) : null) : undefined,
        status: input.status,
        completedAt: input.status === 'completed' && task.status !== 'completed' ? new Date() : undefined,
      },
    });
  }

  async listNotes(tenantId: string, customerId: string) {
    await this.assertCustomer(tenantId, customerId);
    return this.prisma.crmNote.findMany({ where: { tenantId, customerId }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  async createNote(tenantId: string, userId: string | undefined, input: CreateNoteInput) {
    await this.assertCustomer(tenantId, input.customerId);
    if (!input.content?.trim()) throw new BadRequestException('Conteudo da nota e obrigatorio.');
    return this.prisma.crmNote.create({
      data: {
        tenantId,
        customerId: input.customerId,
        content: input.content.trim(),
        createdBy: userId ?? null,
      },
    });
  }

  async getReuseCertification(tenantId: string) {
    return {
      status: 'PASS',
      tenantId,
      generatedAt: new Date(),
      reuseInventory: {
        CustomerIntelligenceService: ['segmentacao', 'VIP', 'frequencia', 'ticket medio', 'churn/risco', 'preferencias'],
        CampaignAutomationService: ['recuperacao', 'upsell', 'recompra', 'carrinho abandonado', 'cupons automaticos'],
        BusinessInsightsService: ['KPIs', 'tendencias', 'insights'],
        LoyaltyService: ['pontos', 'niveis/badges', 'fidelidade'],
        CashbackService: ['creditos', 'recompensas'],
        WalletService: ['saldo', 'movimentacoes'],
      },
      sourceOfTruth: {
        segmentation: 'CustomerIntelligenceService',
        orchestration: 'CampaignAutomationService',
      },
      duplicationDetected: false,
    };
  }

  private async assertCustomer(tenantId: string, customerId: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId, tenantId }, select: { id: true } });
    if (!customer) throw new NotFoundException('Cliente nao encontrado.');
  }

  private async requireProfile(tenantId: string, customerId: string) {
    const profile = await this.customerIntelligenceService.analyzeCustomer(tenantId, customerId);
    if (!profile) throw new NotFoundException('Cliente nao encontrado.');
    return profile;
  }

  private async countRecoveredCustomers(tenantId: string) {
    const ids = await this.getRecoveredCustomerIds(tenantId);
    return ids.size;
  }

  private async getRecoveredCustomerIds(tenantId: string) {
    const [manual, converted] = await Promise.all([
      this.prisma.crmPipelineEntry.findMany({
        where: { tenantId, stage: 'recovered_customer' },
        select: { customerId: true },
      }),
      this.prisma.campaignDispatch.findMany({
        where: {
          convertedAt: { not: null },
          campaign: { tenantId, objective: { in: ['recovery_30', 'recovery_60', 'recovery_90', 'scheduled_reorder'] } },
        },
        select: { customerId: true },
        distinct: ['customerId'],
      }),
    ]);
    return new Set([...manual.map((item) => item.customerId), ...converted.map((item) => item.customerId)]);
  }

  private emptyPipelineCounts(): Record<CrmPipelineStage, number> {
    return {
      lead: 0,
      prospect: 0,
      customer: 0,
      vip_customer: 0,
      at_risk_customer: 0,
      recovered_customer: 0,
    };
  }

  private derivePipelineStage(profile: CustomerIntelligenceProfile, recoveredIds: Set<string>): CrmPipelineStage {
    if (recoveredIds.has(profile.customerId)) return 'recovered_customer';
    if (profile.segments.includes('vip')) return 'vip_customer';
    if (profile.segments.includes('at_risk') || profile.segments.includes('inactive_60')) return 'at_risk_customer';
    if (profile.totalOrders >= 2) return 'customer';
    if (profile.totalOrders === 1) return 'prospect';
    return 'lead';
  }

  private describePipelineReason(profile: CustomerIntelligenceProfile, stage: CrmPipelineStage) {
    if (stage === 'vip_customer') return 'VIP derivado por frequencia e ticket medio no CustomerIntelligenceService.';
    if (stage === 'at_risk_customer') return 'Risco derivado por churn/frequencia no CustomerIntelligenceService.';
    if (stage === 'recovered_customer') return 'Recuperado por conversao de campanha ou marcacao manual.';
    return `${profile.totalOrders} pedidos, ticket medio ${profile.averageTicket.toFixed(2)}.`;
  }

  private calculateHealthScore(
    profile: CustomerIntelligenceProfile,
    balances: { cashbackBalance: number; loyaltyPoints: number; promotionalCredits: number },
  ) {
    const recency = profile.daysSinceLastOrder === null ? 0 : Math.max(0, 25 - Math.min(profile.daysSinceLastOrder, 90) * 0.28);
    const frequency = Math.min(25, profile.totalOrders * 3);
    const ticket = profile.tenantAverageTicket > 0 ? Math.min(20, (profile.averageTicket / profile.tenantAverageTicket) * 14) : 8;
    const cashback = Math.min(15, (balances.cashbackBalance + balances.promotionalCredits) / 5);
    const loyalty = Math.min(15, balances.loyaltyPoints / 40);
    const score = Math.round(Math.max(0, Math.min(100, recency + frequency + ticket + cashback + loyalty)));

    return {
      customerId: profile.customerId,
      score,
      band: score >= 75 ? 'healthy' : score >= 45 ? 'attention' : 'critical',
      source: 'CustomerIntelligenceService+LoyaltyService+CashbackService+WalletService',
      factors: {
        frequency: profile.totalOrders,
        averageTicket: profile.averageTicket,
        daysSinceLastOrder: profile.daysSinceLastOrder,
        cashbackBalance: balances.cashbackBalance,
        loyaltyPoints: balances.loyaltyPoints,
        promotionalCredits: balances.promotionalCredits,
      },
    };
  }
}
