import { MarketplaceDivergenceType, MarketplaceOperationStatus, OrderAlertSeverity, OrderAlertState, OrderStatus } from '@prisma/client';
import { OrderAlertsService } from './order-alerts.service';

describe('OrderAlertsService', () => {
  const tenantId = 'tenant-a';
  const now = new Date('2026-09-13T12:00:00.000Z');

  function setup() {
    const prisma = {
      order: { findMany: jest.fn() },
      orderAlert: { findFirst: jest.fn(), findFirstOrThrow: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    const gateway = { emitOrderAlertChanged: jest.fn() };
    return { prisma, gateway, service: new OrderAlertsService(prisma as never, gateway as never) };
  }

  it('creates one active occurrence and recovers it when the condition disappears', async () => {
    const { prisma, gateway, service } = setup();
    prisma.order.findMany.mockResolvedValueOnce([{ id: 'order-a', orderNumber: '100', status: OrderStatus.pending, createdAt: new Date(), marketplaceOrders: [] }]).mockResolvedValueOnce([]);
    prisma.orderAlert.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'alert-a' });
    prisma.orderAlert.create.mockResolvedValue({ id: 'alert-a' });
    prisma.orderAlert.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'alert-a', fingerprint: 'order-a:ORDER_WAITING_ACTION' }]);
    prisma.orderAlert.update.mockResolvedValue({ id: 'alert-a' });

    await service.refreshTenant(tenantId);
    await service.refreshTenant(tenantId);

    expect(prisma.orderAlert.create).toHaveBeenCalledTimes(1);
    expect(prisma.orderAlert.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ severity: OrderAlertSeverity.ATTENTION, fingerprint: 'order-a:ORDER_WAITING_ACTION', occurrence: 1 }) }));
    expect(prisma.orderAlert.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ state: OrderAlertState.RECOVERED }) }));
    expect(gateway.emitOrderAlertChanged).toHaveBeenCalledWith(tenantId, 'alert-a', 'RECOVERED', 'recovered');
  });

  it('keeps acknowledgement idempotent and tenant scoped', async () => {
    const { prisma, gateway, service } = setup();
    prisma.orderAlert.findFirstOrThrow.mockResolvedValue({ id: 'alert-a', tenantId, state: OrderAlertState.ACTIVE, acknowledgedAt: null });
    prisma.orderAlert.update.mockResolvedValue({ id: 'alert-a', state: OrderAlertState.ACTIVE });

    await service.acknowledge(tenantId, 'alert-a', 'user-a');

    expect(prisma.orderAlert.findFirstOrThrow).toHaveBeenCalledWith({ where: { id: 'alert-a', tenantId } });
    expect(prisma.orderAlert.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ acknowledgedById: 'user-a' }) }));
    expect(gateway.emitOrderAlertChanged).toHaveBeenCalledWith(tenantId, 'alert-a', 'ACTIVE', 'acknowledged');

    prisma.orderAlert.findFirstOrThrow.mockResolvedValue({ id: 'alert-a', tenantId, state: OrderAlertState.ACTIVE, acknowledgedAt: now });
    await service.acknowledge(tenantId, 'alert-a', 'user-a');
    expect(prisma.orderAlert.update).toHaveBeenCalledTimes(1);
  });

  it('creates the same waiting-acceptance occurrence for every pending channel', async () => {
    const { prisma, service } = setup();
    prisma.order.findMany.mockResolvedValue([
      { id: 'pedehub-order', orderNumber: '101', status: OrderStatus.pending, createdAt: new Date(), marketplaceOrders: [] },
      { id: 'ifood-order', orderNumber: '102', status: OrderStatus.pending, createdAt: new Date(), marketplaceOrders: [{ operations: [], divergences: [] }] },
      { id: 'food99-order', orderNumber: '103', status: OrderStatus.pending, createdAt: new Date(), marketplaceOrders: [{ operations: [], divergences: [] }] },
    ]);
    prisma.orderAlert.findFirst.mockResolvedValue(null);
    prisma.orderAlert.create.mockResolvedValue({ id: 'alert-a' });
    prisma.orderAlert.findMany.mockResolvedValue([]);

    await service.refreshTenant(tenantId);

    expect(prisma.orderAlert.create).toHaveBeenCalledTimes(3);
    for (const orderId of ['pedehub-order', 'ifood-order', 'food99-order']) {
      expect(prisma.orderAlert.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          orderId,
          ruleKey: 'ORDER_WAITING_ACTION',
          fingerprint: `${orderId}:ORDER_WAITING_ACTION`,
        }),
      }));
    }
  });

  it('creates a critical alert only for an authoritative failed marketplace operation', async () => {
    const { prisma, service } = setup();
    prisma.order.findMany.mockResolvedValue([{ id: 'order-a', orderNumber: '100', status: OrderStatus.confirmed, createdAt: now, marketplaceOrders: [{ operations: [{ id: 'operation-a', status: MarketplaceOperationStatus.FAILED }], divergences: [] }] }]);
    prisma.orderAlert.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    prisma.orderAlert.create.mockResolvedValue({ id: 'alert-a' });
    prisma.orderAlert.findMany.mockResolvedValue([]);

    await service.refreshTenant(tenantId);

    expect(prisma.orderAlert.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ ruleKey: 'ORDER_SYNC_FAILED', severity: OrderAlertSeverity.CRITICAL }) }));
  });

  it('keeps an unmapped catalog item visible without calling it a critical reconciliation failure', async () => {
    const { prisma, service } = setup();
    prisma.order.findMany.mockResolvedValue([{
      id: 'order-catalog', orderNumber: '#0246', status: OrderStatus.ready_for_delivery, createdAt: now,
      marketplaceOrders: [{
        operations: [],
        divergences: [{ id: 'divergence-catalog', type: MarketplaceDivergenceType.UNKNOWN_EXTERNAL_STATE, reason: 'Marketplace catalog items are unmapped: Copo Açai 330 ml' }],
      }],
    }]);
    prisma.orderAlert.findFirst.mockResolvedValue(null);
    prisma.orderAlert.create.mockResolvedValue({ id: 'alert-catalog' });
    prisma.orderAlert.findMany.mockResolvedValue([]);

    await service.refreshTenant(tenantId);

    expect(prisma.orderAlert.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      ruleKey: 'MARKETPLACE_CATALOG_MAPPING_REQUIRED', severity: OrderAlertSeverity.INFO,
      title: 'Produto do marketplace precisa de associação no pedido #0246',
    }) }));
    expect(prisma.orderAlert.create).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      ruleKey: 'PROVIDER_RECONCILIATION_FAILED', severity: OrderAlertSeverity.CRITICAL,
    }) }));
  });

  it('keeps a permanent provider rejection critical and formats a stored number with one hash', async () => {
    const { prisma, service } = setup();
    prisma.order.findMany.mockResolvedValue([{
      id: 'order-provider', orderNumber: '#0151', status: OrderStatus.preparing, createdAt: now,
      marketplaceOrders: [{
        operations: [],
        divergences: [{ id: 'divergence-provider', type: MarketplaceDivergenceType.PERMANENT_PROVIDER_REJECTION, reason: 'Provider rejected the action.' }],
      }],
    }]);
    prisma.orderAlert.findFirst.mockResolvedValue(null);
    prisma.orderAlert.create.mockResolvedValue({ id: 'alert-provider' });
    prisma.orderAlert.findMany.mockResolvedValue([]);

    await service.refreshTenant(tenantId);

    expect(prisma.orderAlert.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      ruleKey: 'PROVIDER_RECONCILIATION_FAILED', severity: OrderAlertSeverity.CRITICAL,
      title: 'Divergência de reconciliação no pedido #0151',
    }) }));
  });

  it('does not classify a 14-minute-old order as CRITICAL just because of elapsed time', async () => {
    const { prisma, service } = setup();
    prisma.order.findMany.mockResolvedValue([{
      id: 'order-14m', orderNumber: '210004', status: OrderStatus.preparing,
      createdAt: new Date(Date.now() - 14 * 60_000), marketplaceOrders: [{ operations: [], divergences: [] }],
    }]);
    prisma.orderAlert.findMany.mockResolvedValue([]);

    await service.refreshTenant(tenantId);

    expect(prisma.orderAlert.create).not.toHaveBeenCalled();
  });

  it('creates one active courier-arrived alert only for provider-owned 99Food logistics', async () => {
    const { prisma, service } = setup();
    prisma.order.findMany.mockResolvedValue([{
      id: 'order-99', orderNumber: '99', status: OrderStatus.ready_for_delivery, createdAt: now,
      marketplaceOrders: [{
        operations: [], divergences: [], provider: 'FOOD_99', deliveryOwnership: 'PROVIDER',
        normalizedPayload: { logistics: { deliveryStatus: '130' } },
      }],
    }]);
    prisma.orderAlert.findFirst.mockResolvedValue(null);
    prisma.orderAlert.create.mockResolvedValue({ id: 'alert-99' });
    prisma.orderAlert.findMany.mockResolvedValue([]);

    await service.refreshTenant(tenantId);

    expect(prisma.orderAlert.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        orderId: 'order-99',
        ruleKey: 'MARKETPLACE_COURIER_ARRIVED',
        fingerprint: 'order-99:MARKETPLACE_COURIER_ARRIVED',
      }),
    }));
  });
});
