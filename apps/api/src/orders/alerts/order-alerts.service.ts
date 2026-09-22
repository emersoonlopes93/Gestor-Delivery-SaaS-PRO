import { Injectable } from '@nestjs/common';
import { MarketplaceDivergenceStatus, MarketplaceDivergenceType, MarketplaceOperationStatus, OrderAlertSeverity, OrderAlertState, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { OrdersGateway } from '../orders.gateway';

export const ORDER_ALERT_RULES = {
  ORDER_WAITING_ACTION: 'ORDER_WAITING_ACTION',
  ORDER_DELAYED: 'ORDER_DELAYED',
  ORDER_SYNC_FAILED: 'ORDER_SYNC_FAILED',
  PROVIDER_RECONCILIATION_FAILED: 'PROVIDER_RECONCILIATION_FAILED',
  MARKETPLACE_CATALOG_MAPPING_REQUIRED: 'MARKETPLACE_CATALOG_MAPPING_REQUIRED',
  MARKETPLACE_COURIER_ARRIVED: 'MARKETPLACE_COURIER_ARRIVED',
} as const;

type RuleKey = (typeof ORDER_ALERT_RULES)[keyof typeof ORDER_ALERT_RULES];
type Candidate = {
  orderId: string;
  ruleKey: RuleKey;
  severity: OrderAlertSeverity;
  title: string;
  message: string;
  metadata: Prisma.InputJsonValue;
};

const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.pending,
  OrderStatus.confirmed,
  OrderStatus.preparing,
  OrderStatus.ready_for_pickup,
  OrderStatus.ready_for_delivery,
  OrderStatus.out_for_delivery,
];

@Injectable()
export class OrderAlertsService {
  constructor(private readonly prisma: PrismaService, private readonly gateway: OrdersGateway) {}

  async list(tenantId: string, state?: OrderAlertState) {
    return this.prisma.orderAlert.findMany({
      where: { tenantId, ...(state ? { state } : {}) },
      orderBy: [{ state: 'asc' }, { severity: 'desc' }, { lastSeenAt: 'desc' }],
      take: 100,
    });
  }

  async acknowledge(tenantId: string, alertId: string, userId: string) {
    const alert = await this.prisma.orderAlert.findFirstOrThrow({ where: { id: alertId, tenantId } });
    if (alert.state === OrderAlertState.RECOVERED || alert.acknowledgedAt) return alert;
    const acknowledged = await this.prisma.orderAlert.update({
      where: { id: alert.id },
      data: { acknowledgedAt: new Date(), acknowledgedById: userId },
    });
    this.gateway.emitOrderAlertChanged(tenantId, acknowledged.id, 'ACTIVE', 'acknowledged');
    return acknowledged;
  }

  /** Re-evaluates only existing operational facts. No SLA or inferred provider state is used. */
  async refreshTenant(tenantId: string) {
    const now = new Date();
    const delayedBefore = new Date(now.getTime() - 30 * 60_000);
    const orders = await this.prisma.order.findMany({
      where: { tenantId, status: { in: ACTIVE_ORDER_STATUSES } },
      select: {
        id: true, orderNumber: true, status: true, createdAt: true,
        marketplaceOrders: { select: {
          operations: { where: { status: { in: [MarketplaceOperationStatus.FAILED, MarketplaceOperationStatus.INTERVENTION_REQUIRED] } }, select: { id: true, status: true } },
          divergences: { where: { status: MarketplaceDivergenceStatus.OPEN }, select: { id: true, type: true, reason: true } },
          provider: true,
          deliveryOwnership: true,
          normalizedPayload: true,
        } },
      },
    });
    const candidates: Candidate[] = [];
    for (const order of orders) {
      const displayNumber = this.displayNumber(order.orderNumber);
      if (order.status === OrderStatus.pending) candidates.push({
        orderId: order.id, ruleKey: ORDER_ALERT_RULES.ORDER_WAITING_ACTION, severity: OrderAlertSeverity.ATTENTION,
        title: `Pedido ${displayNumber} aguardando ação`, message: 'O pedido continua pendente de confirmação.', metadata: { orderNumber: displayNumber },
      });
      if (order.createdAt < delayedBefore) candidates.push({
        orderId: order.id, ruleKey: ORDER_ALERT_RULES.ORDER_DELAYED, severity: OrderAlertSeverity.ATTENTION,
        title: `Pedido ${displayNumber} atrasado`, message: 'O pedido ultrapassou o limiar operacional existente de 30 minutos.', metadata: { orderNumber: displayNumber, thresholdMinutes: 30 },
      });
      if (order.marketplaceOrders.some((marketplaceOrder) => marketplaceOrder.operations.length > 0)) candidates.push({
        orderId: order.id, ruleKey: ORDER_ALERT_RULES.ORDER_SYNC_FAILED, severity: OrderAlertSeverity.CRITICAL,
        title: `Falha de sincronização no pedido ${displayNumber}`, message: 'Uma operação de marketplace falhou e exige verificação.', metadata: { orderNumber: displayNumber },
      });
      const openDivergences = order.marketplaceOrders.flatMap((marketplaceOrder) => marketplaceOrder.divergences);
      if (openDivergences.some((divergence) => this.requiresCriticalReconciliationAlert(divergence))) candidates.push({
        orderId: order.id, ruleKey: ORDER_ALERT_RULES.PROVIDER_RECONCILIATION_FAILED, severity: OrderAlertSeverity.CRITICAL,
        title: `Divergência de reconciliação no pedido ${displayNumber}`,
        message: 'A integração exige verificação antes de uma nova tentativa.', metadata: { orderNumber: displayNumber },
      });
      const unmapped = openDivergences.find((divergence) => this.isCatalogMappingDivergence(divergence));
      if (unmapped) candidates.push({
        orderId: order.id, ruleKey: ORDER_ALERT_RULES.MARKETPLACE_CATALOG_MAPPING_REQUIRED, severity: OrderAlertSeverity.INFO,
        title: `Produto do marketplace precisa de associação no pedido ${displayNumber}`,
        message: 'O pedido segue operável; a baixa de estoque deste item foi mantida em espera para evitar erro.',
        metadata: { orderNumber: displayNumber, divergenceType: unmapped.type },
      });
      if (order.marketplaceOrders.some((marketplaceOrder) => this.isFood99CourierAtRestaurant(marketplaceOrder))) {
        candidates.push({
          orderId: order.id, ruleKey: ORDER_ALERT_RULES.MARKETPLACE_COURIER_ARRIVED, severity: OrderAlertSeverity.ATTENTION,
          title: `Entregador da 99Food chegou para o pedido ${displayNumber}`,
          message: 'O entregador parceiro chegou ao estabelecimento e aguarda a retirada.',
          metadata: { orderNumber: displayNumber, provider: '99food' },
        });
      }
    }
    const activeKeys = new Set(candidates.map((candidate) => this.fingerprint(candidate)));
    for (const candidate of candidates) await this.upsertActive(tenantId, candidate);
    const active = await this.prisma.orderAlert.findMany({ where: { tenantId, state: OrderAlertState.ACTIVE }, select: { id: true, fingerprint: true } });
    await Promise.all(active.filter((alert) => !activeKeys.has(alert.fingerprint)).map(async (alert) => {
      const recovered = await this.prisma.orderAlert.update({ where: { id: alert.id }, data: { state: OrderAlertState.RECOVERED, recoveredAt: now } });
      this.gateway.emitOrderAlertChanged(tenantId, recovered.id, 'RECOVERED', 'recovered');
    }));
  }

  private fingerprint(candidate: Candidate) { return `${candidate.orderId}:${candidate.ruleKey}`; }

  private displayNumber(orderNumber: string): string {
    return `#${orderNumber.trim().replace(/^#+\s*/, '')}`;
  }

  private requiresCriticalReconciliationAlert(divergence: { type: MarketplaceDivergenceType; reason: string }): boolean {
    return divergence.type === MarketplaceDivergenceType.AUTHENTICATION_FAILURE
      || divergence.type === MarketplaceDivergenceType.INVALID_TRANSITION
      || divergence.type === MarketplaceDivergenceType.OPERATION_TIMEOUT
      || divergence.type === MarketplaceDivergenceType.EVENT_MISSING
      || divergence.type === MarketplaceDivergenceType.PERMANENT_PROVIDER_REJECTION
      || (divergence.type === MarketplaceDivergenceType.UNKNOWN_EXTERNAL_STATE && !this.isCatalogMappingDivergence(divergence));
  }

  private isCatalogMappingDivergence(divergence: { type: MarketplaceDivergenceType; reason: string }): boolean {
    return divergence.type === MarketplaceDivergenceType.UNKNOWN_EXTERNAL_STATE
      && /^Marketplace catalog items are unmapped:/i.test(divergence.reason);
  }

  private isFood99CourierAtRestaurant(marketplaceOrder: {
    provider: string;
    deliveryOwnership: string;
    normalizedPayload: Prisma.JsonValue;
  }): boolean {
    if (marketplaceOrder.provider !== 'FOOD_99' || marketplaceOrder.deliveryOwnership !== 'PROVIDER') return false;
    const payload = marketplaceOrder.normalizedPayload;
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return false;
    const logistics = (payload as Record<string, unknown>).logistics;
    if (typeof logistics !== 'object' || logistics === null || Array.isArray(logistics)) return false;
    return (logistics as Record<string, unknown>).deliveryStatus === '130';
  }

  private async upsertActive(tenantId: string, candidate: Candidate) {
    const fingerprint = this.fingerprint(candidate);
    const existing = await this.prisma.orderAlert.findFirst({ where: { tenantId, fingerprint, state: OrderAlertState.ACTIVE } });
    if (existing) {
      await this.prisma.orderAlert.update({ where: { id: existing.id }, data: { lastSeenAt: new Date(), severity: candidate.severity, title: candidate.title, message: candidate.message, metadata: candidate.metadata } });
      return;
    }
    const latest = await this.prisma.orderAlert.findFirst({ where: { tenantId, fingerprint }, orderBy: { occurrence: 'desc' }, select: { occurrence: true } });
    try {
      const created = await this.prisma.orderAlert.create({ data: { tenantId, orderId: candidate.orderId, ruleKey: candidate.ruleKey, severity: candidate.severity, fingerprint, occurrence: (latest?.occurrence ?? 0) + 1, title: candidate.title, message: candidate.message, metadata: candidate.metadata } });
      this.gateway.emitOrderAlertChanged(tenantId, created.id, 'ACTIVE', 'created');
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    }
  }
}
