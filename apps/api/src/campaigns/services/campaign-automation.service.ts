import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { CampaignsService } from './campaigns.service';
import { RecoveryCampaignService } from './recovery-campaign.service';
import { AbandonedCartService } from './abandoned-cart.service';
import { UpsellRecommendationEngine } from './upsell-recommendation.engine';
import { CustomerIntelligenceService } from '../../crm/customer-intelligence.service';
import { BusinessInsightsService } from '../../analytics/business-insights.service';
import { PrismaService } from '../../database/prisma.service';
import { CouponsService } from '../../promotions/coupons.service';

type AutomationRunResult = {
  tenantId: string;
  scheduledCampaignsStarted: number;
  conversions: number;
  revenueGenerated: number;
  recoveryCampaigns: number;
  abandonedCartReminders: number;
  reorderCampaigns: number;
  upsellCampaigns: number;
  smartCoupons: number;
  failures: Array<{ automation: string; reason: string }>;
};

@Injectable()
export class CampaignAutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignAutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly campaignsService: CampaignsService,
    private readonly recoveryCampaignService: RecoveryCampaignService,
    private readonly abandonedCartService: AbandonedCartService,
    private readonly upsellRecommendationEngine: UpsellRecommendationEngine,
    private readonly customerIntelligenceService: CustomerIntelligenceService,
    private readonly businessInsightsService: BusinessInsightsService,
    private readonly couponsService: CouponsService,
    @Optional() @InjectQueue('campaign-dispatch') private readonly campaignQueue?: Queue,
  ) {}

  onModuleInit() {
    if (process.env.CAMPAIGN_AUTOMATION_ENABLED !== 'true') {
      this.logger.log('Campaign automation scheduler disabled. Set CAMPAIGN_AUTOMATION_ENABLED=true to enable.');
      return;
    }

    if (!this.campaignQueue) {
      this.logger.warn('Campaign automation scheduler requires campaign-dispatch queue, but it is not available (Redis disabled).');
      return;
    }

    this.logger.log('Campaign automation scheduler enabled via BullMQ.');
    this.campaignQueue.add(
      'system-automation-scan',
      { isSystemJob: true },
      {
        jobId: 'system-automation-scan',
        repeat: {
          every: 5 * 60 * 1000,
        },
      },
    ).catch(err => {
      this.logger.error(`Erro ao registrar job system-automation-scan: ${err.message}`);
    });
  }

  onModuleDestroy() {
    // Nada a fazer, o BullMQ gerencia os jobs repetíveis
  }

  async getAutomationConfigs(tenantId: string) {
    return this.prisma.marketingAutomation.findMany({
      where: { tenantId },
    });
  }

  async saveAutomationConfig(tenantId: string, type: string, data: { enabled: boolean; messageTemplate: string; config: Prisma.InputJsonValue }) {
    return this.prisma.marketingAutomation.upsert({
      where: { tenantId_type: { tenantId, type } },
      create: { tenantId, type, ...data },
      update: data,
    });
  }

  async getFeedbackMetrics(tenantId: string) {
    const feedbacks = await this.prisma.orderFeedback.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        order: { select: { orderNumber: true } },
        customer: { select: { name: true, phone: true } },
      },
    });

    const total = await this.prisma.orderFeedback.count({ where: { tenantId } });
    const aggregations = await this.prisma.orderFeedback.aggregate({
      where: { tenantId },
      _avg: { rating: true },
    });

    return {
      feedbacks,
      total,
      averageRating: aggregations._avg.rating || 0,
    };
  }

  async getReuseInventory(tenantId: string) {
    const [recoveryPreview, abandonedCarts, insights, reorderCandidates] = await Promise.all([
      this.recoveryCampaignService.preview(tenantId),
      this.abandonedCartService.getDueCarts(tenantId),
      this.businessInsightsService.generateInsights(tenantId),
      this.customerIntelligenceService.getReorderCandidates(tenantId),
    ]);

    return {
      CustomerIntelligenceService: {
        reusedFor: ['recompra_programada', 'segmentos', 'historico_cliente'],
        availableCandidates: reorderCandidates.length,
      },
      RecoveryCampaignService: {
        reusedFor: ['recuperacao_30_dias', 'recuperacao_60_dias', 'recuperacao_90_dias'],
        preview: recoveryPreview,
      },
      UpsellRecommendationEngine: {
        reusedFor: ['upsell_pos_compra', 'produtos_comprados_juntos'],
      },
      AbandonedCartService: {
        reusedFor: ['carrinho_abandonado_30m_2h_24h'],
        dueCarts: abandonedCarts.length,
      },
      BusinessInsightsService: {
        reusedFor: ['insights_do_centro_de_automacoes'],
        insights: insights.insights.length,
      },
      EvolutionWhatsAppIntegration: {
        reusedFor: ['envio_real_ou_mock_via_WhatsAppSenderService'],
      },
      SchedulerCronExistente: {
        reusedFor: ['setInterval_do_modulo_campaigns', 'CampaignDispatcherService_BullMQ_quando_habilitado'],
      },
      NotificationServices: {
        reusedFor: ['WhatsAppSenderService', 'registro_em_chat_outbound'],
      },
      justificationForNewCode:
        'Foi criado apenas um orquestrador dentro do modulo campaigns para coordenar servicos existentes; nenhuma regra de segmentacao, recuperacao, upsell ou carrinho foi duplicada.',
    };
  }

  async getCommercialAiRecommendations(tenantId: string) {
    const [segments, insights, retention] = await Promise.all([
      this.customerIntelligenceService.getSegments(tenantId),
      this.businessInsightsService.generateInsights(tenantId),
      this.businessInsightsService.getRetentionDashboard(tenantId),
    ]);

    const suggestions: Array<{ type: string; priority: 'high' | 'medium' | 'low'; message: string; audience?: number }> = [];
    if (segments.bySegment.inactive_30.length) {
      suggestions.push({
        type: 'coupon',
        priority: 'high',
        message: 'Criar cupom de retorno para clientes inativos ha 30 dias.',
        audience: segments.bySegment.inactive_30.length,
      });
    }
    if (segments.bySegment.vip.length) {
      suggestions.push({
        type: 'benefit',
        priority: 'medium',
        message: 'Oferecer beneficio exclusivo para clientes VIP.',
        audience: segments.bySegment.vip.length,
      });
    }
    if (retention.retentionRate < 0.35) {
      suggestions.push({
        type: 'cashback',
        priority: 'high',
        message: 'Aumentar cashback temporariamente para elevar recompra.',
      });
    }
    for (const insight of insights.insights.filter((item) => item.type === 'product_pairing')) {
      suggestions.push({
        type: 'campaign',
        priority: 'medium',
        message: `Usar insight de compra combinada: ${insight.message}`,
      });
    }

    return {
      generatedAt: new Date(),
      source: 'CustomerIntelligenceService+BusinessInsightsService',
      churnRiskCustomers: segments.bySegment.at_risk.length,
      vipCustomers: segments.bySegment.vip.length,
      suggestions,
    };
  }

  async runAllTenants() {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: { in: ['active', 'trial'] } },
      select: { id: true },
      take: 100,
    });

    const results: AutomationRunResult[] = [];
    for (const tenant of tenants) {
      results.push(await this.runTenantAutomations(tenant.id));
    }
    return results;
  }

  async runTenantAutomations(tenantId: string): Promise<AutomationRunResult> {
    const result: AutomationRunResult = {
      tenantId,
      scheduledCampaignsStarted: 0,
      conversions: 0,
      revenueGenerated: 0,
      recoveryCampaigns: 0,
      abandonedCartReminders: 0,
      reorderCampaigns: 0,
      upsellCampaigns: 0,
      smartCoupons: 0,
      failures: [],
    };

    const due = await this.campaignsService.startDueScheduledCampaigns(tenantId);
    result.scheduledCampaignsStarted = due.started;

    const conversions = await this.campaignsService.markConversionsFromOrders(tenantId);
    result.conversions = conversions.converted;
    result.revenueGenerated = conversions.revenueGenerated;

    await this.runRecovery(tenantId, result);
    await this.runAbandonedCart(tenantId, result);
    await this.runReorder(tenantId, result);
    await this.runPostPurchaseUpsell(tenantId, result);
    await this.runSmartCoupons(tenantId, result);
    
    // P1 Automations
    await this.runPostOrderReview(tenantId, result);
    await this.runInactiveWinback(tenantId, result);
    await this.runBirthdayGreeting(tenantId, result);

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userType: 'system',
        action: 'campaign_automation_run',
        resource: 'campaign',
        details: result as Record<string, unknown> as Prisma.JsonObject,
      },
    });

    return result;
  }

  private async getTemplateVariables(tenantId: string, customer: { name: string }, order?: { orderNumber: string, total: import('@prisma/client').Prisma.Decimal | number, publicTrackingToken?: string }, config?: { config: import('@prisma/client').Prisma.JsonValue }) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const storeName = tenant?.name || 'nossa loja';
    const menuLink = `https://${tenant?.slug}.gestordelivery.com`;
    const couponCode = (config?.config as Record<string, string>)?.couponCode || '';
    
    return {
      '{nome}': customer?.name ? customer.name.split(' ')[0] : 'cliente',
      '{nome_loja}': storeName,
      '{link_cardapio}': menuLink,
      '{cupom}': couponCode,
      '{pedido}': order ? `#${order.orderNumber}` : '',
      '{total}': order ? `R$ ${Number(order.total).toFixed(2).replace('.', ',')}` : '',
      '{link_feedback}': order && order.publicTrackingToken && tenant ? `https://${tenant.slug}.gestordelivery.com/feedback/${order.publicTrackingToken}` : '',
    };
  }

  private applyTemplate(template: string, vars: Record<string, string>) {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(key, 'g'), value);
    }
    return result;
  }

  private async runPostOrderReview(tenantId: string, result: AutomationRunResult) {
    try {
      const config = await this.prisma.marketingAutomation.findUnique({
        where: { tenantId_type: { tenantId, type: 'post_order_review' } }
      });
      if (!config || !config.enabled) return;

      const delayHours = Number((config.config as Record<string, number>)?.delayHours ?? 2);
      const limitDate = new Date(Date.now() - delayHours * 60 * 60 * 1000);
      const limitWindow = new Date(Date.now() - (delayHours + 24) * 60 * 60 * 1000);

      const orders = await this.prisma.order.findMany({
        where: {
          tenantId,
          status: { in: ['completed'] },
          customerId: { not: null },
          updatedAt: { gte: limitWindow, lte: limitDate },
          OrderFeedback: null,
        },
        include: { customer: true },
      });

      for (const order of orders) {
        if (!order.customerId) continue;
        const name = `Pos-pedido #${order.orderNumber}`;
        if (await this.hasNamedCampaign(tenantId, name)) continue;

        const vars = await this.getTemplateVariables(tenantId, { name: order.customerName }, order, config);
        const message = this.applyTemplate(config.messageTemplate, vars);

        const campaign = await this.campaignsService.createCampaign(tenantId, {
          name,
          objective: 'post_order_review',
          messageTemplate: message,
          segmentRules: { specificCustomers: [order.customerId] },
          maxDispatches: 1,
        });
        await this.campaignsService.startCampaign(tenantId, campaign.id);
      }
    } catch (e) {
      this.captureFailure(result, 'post_order_review', e);
    }
  }

  private async runInactiveWinback(tenantId: string, result: AutomationRunResult) {
    try {
      const config = await this.prisma.marketingAutomation.findUnique({
        where: { tenantId_type: { tenantId, type: 'inactive_customer_winback' } }
      });
      if (!config || !config.enabled) return;

      const daysInactive = Number((config.config as Record<string, number>)?.daysInactive ?? 30);
      const limitDate = new Date();
      limitDate.setDate(limitDate.getDate() - daysInactive);

      const limitWindow = new Date(limitDate);
      limitWindow.setDate(limitWindow.getDate() - 7);

      const customers = await this.prisma.customer.findMany({
        where: {
          tenantId,
          lastOrderDate: { gte: limitWindow, lte: limitDate },
          totalOrders: { gt: 0 }
        }
      });

      for (const customer of customers) {
        if (await this.hasRecentCustomerCampaign(tenantId, customer.id, 'inactive_customer_winback', 30)) continue;

        const vars = await this.getTemplateVariables(tenantId, customer, undefined, config);
        const message = this.applyTemplate(config.messageTemplate, vars);

        const campaign = await this.campaignsService.createCampaign(tenantId, {
          name: `Retorno inativo - ${customer.name}`,
          objective: 'inactive_customer_winback',
          messageTemplate: message,
          segmentRules: { specificCustomers: [customer.id] },
          maxDispatches: 1,
        });
        await this.campaignsService.startCampaign(tenantId, campaign.id);
      }
    } catch (e) {
      this.captureFailure(result, 'inactive_customer_winback', e);
    }
  }

  private async runBirthdayGreeting(tenantId: string, result: AutomationRunResult) {
    try {
      const config = await this.prisma.marketingAutomation.findUnique({
        where: { tenantId_type: { tenantId, type: 'birthday_greeting' } }
      });
      if (!config || !config.enabled) return;

      const today = new Date();
      const month = today.getMonth() + 1;
      const day = today.getDate();

      const customers = await this.prisma.$queryRaw<{id: string, name: string}[]>`
        SELECT id, name FROM customers 
        WHERE tenant_id = ${tenantId} 
        AND birth_date IS NOT NULL 
        AND EXTRACT(MONTH FROM birth_date) = ${month} 
        AND EXTRACT(DAY FROM birth_date) = ${day}
      `;

      for (const customer of customers) {
        if (await this.hasRecentCustomerCampaign(tenantId, customer.id, 'birthday_greeting', 360)) continue;

        const vars = await this.getTemplateVariables(tenantId, customer, undefined, config);
        const message = this.applyTemplate(config.messageTemplate, vars);

        const campaign = await this.campaignsService.createCampaign(tenantId, {
          name: `Feliz aniversario - ${customer.name}`,
          objective: 'birthday_greeting',
          messageTemplate: message,
          segmentRules: { specificCustomers: [customer.id] },
          maxDispatches: 1,
        });
        await this.campaignsService.startCampaign(tenantId, campaign.id);
      }
    } catch (e) {
      this.captureFailure(result, 'birthday_greeting', e);
    }
  }

  private async runRecovery(tenantId: string, result: AutomationRunResult) {
    for (const days of [30, 60, 90] as const) {
      try {
        if (await this.hasCampaignCreatedToday(tenantId, `recovery_${days}`)) continue;
        const campaign = await this.recoveryCampaignService.createRecoveryCampaign(tenantId, days);
        await this.campaignsService.startCampaign(tenantId, campaign.id);
        result.recoveryCampaigns += 1;
      } catch (error) {
        this.captureFailure(result, `recovery_${days}`, error);
      }
    }
  }

  private async runAbandonedCart(tenantId: string, result: AutomationRunResult) {
    try {
      const dispatched = await this.abandonedCartService.dispatchDueReminders(tenantId, 25);
      result.abandonedCartReminders = dispatched.results.filter((item) => item.queued).length;
    } catch (error) {
      this.captureFailure(result, 'abandoned_cart', error);
    }
  }

  private async runReorder(tenantId: string, result: AutomationRunResult) {
    try {
      const candidates = await this.customerIntelligenceService.getReorderCandidates(tenantId);
      for (const candidate of candidates.slice(0, 25)) {
        if (await this.hasRecentCustomerCampaign(tenantId, candidate.customerId, 'scheduled_reorder', 7)) continue;

        const productText = candidate.favoriteProduct ? ` de ${candidate.favoriteProduct.name}` : '';
        const campaign = await this.campaignsService.createCampaign(tenantId, {
          name: `Recompra programada - ${candidate.name}`,
          objective: 'scheduled_reorder',
          messageTemplate: `Oi {{nome}}, seu intervalo medio de compra e de ${candidate.averageIntervalDays} dias. Que tal repetir seu pedido${productText} hoje?`,
          segmentRules: { specificCustomers: [candidate.customerId] },
          maxDispatches: 1,
        });
        await this.campaignsService.startCampaign(tenantId, campaign.id);
        result.reorderCampaigns += 1;
      }
    } catch (error) {
      this.captureFailure(result, 'scheduled_reorder', error);
    }
  }

  private async runPostPurchaseUpsell(tenantId: string, result: AutomationRunResult) {
    const delayMinutes = Number(process.env.POST_PURCHASE_UPSELL_DELAY_MINUTES ?? 60);
    const dueBefore = new Date(Date.now() - delayMinutes * 60 * 1000);
    const recentSince = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const orders = await this.prisma.order.findMany({
      where: {
        tenantId,
        status: 'completed',
        customerId: { not: null },
        createdAt: { gte: recentSince, lte: dueBefore },
      },
      include: { items: true, customer: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    for (const order of orders) {
      try {
        if (!order.customerId || !order.customer) continue;
        if (await this.hasNamedCampaign(tenantId, `Upsell pos-compra ${order.orderNumber}`)) continue;

        const recommendations = await this.upsellRecommendationEngine.recommend(tenantId, {
          customerId: order.customerId,
          items: order.items.map((item) => ({ productId: item.productId, comboId: item.comboId, quantity: item.quantity })),
          limit: 1,
        });
        const recommendation = recommendations.recommendations[0];
        if (!recommendation) continue;

        const campaign = await this.campaignsService.createCampaign(tenantId, {
          name: `Upsell pos-compra ${order.orderNumber}`,
          objective: 'post_purchase_upsell',
          messageTemplate: `{{nome}}, obrigado pelo pedido! Para completar a experiencia, que tal adicionar ${recommendation.name} no proximo pedido?`,
          segmentRules: { specificCustomers: [order.customerId] },
          maxDispatches: 1,
        });
        await this.campaignsService.startCampaign(tenantId, campaign.id);
        result.upsellCampaigns += 1;
      } catch (error) {
        this.captureFailure(result, 'post_purchase_upsell', error);
      }
    }
  }

  private async runSmartCoupons(tenantId: string, result: AutomationRunResult) {
    try {
      const { bySegment } = await this.customerIntelligenceService.getSegments(tenantId);
      const specs = [
        { key: 'inactive_30', prefix: 'VOLTE', value: 10, type: 'percentage' as const },
        { key: 'new', prefix: 'BEMVINDO', value: 8, type: 'percentage' as const },
        { key: 'vip', prefix: 'VIP', value: 15, type: 'percentage' as const },
      ];
      for (const spec of specs) {
        const audience = bySegment[spec.key as keyof typeof bySegment] ?? [];
        if (!audience.length) continue;
        const code = `${spec.prefix}${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
        const existing = await this.prisma.coupon.findFirst({ where: { tenantId, code }, select: { id: true } });
        if (existing) continue;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 14);
        await this.couponsService.createCoupon(tenantId, {
          code,
          type: spec.type,
          value: spec.value,
          usageLimit: audience.length,
          expiresAt: expiresAt.toISOString(),
          isActive: true,
        });
        result.smartCoupons += 1;
      }
    } catch (error) {
      this.captureFailure(result, 'smart_coupons', error);
    }
  }

  private async hasCampaignCreatedToday(tenantId: string, objective: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Boolean(
      await this.prisma.campaign.findFirst({
        where: { tenantId, objective, createdAt: { gte: today } },
        select: { id: true },
      }),
    );
  }

  private async hasRecentCustomerCampaign(tenantId: string, customerId: string, objective: string, days: number) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    return Boolean(
      await this.prisma.campaignDispatch.findFirst({
        where: {
          customerId,
          createdAt: { gte: since },
          campaign: { tenantId, objective },
        },
        select: { id: true },
      }),
    );
  }

  private async hasNamedCampaign(tenantId: string, name: string) {
    return Boolean(await this.prisma.campaign.findFirst({ where: { tenantId, name }, select: { id: true } }));
  }

  private captureFailure(result: AutomationRunResult, automation: string, error: unknown) {
    if (error instanceof BadRequestException) {
      result.failures.push({ automation, reason: error.message });
      return;
    }
    const reason = error instanceof Error ? error.message : 'unknown_error';
    result.failures.push({ automation, reason });
  }
}
