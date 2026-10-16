import { MarketplaceDivergenceStatus, MarketplaceDivergenceType, MarketplaceOperationStatus, OrderAlertSeverity, OrderAlertState, OrderStatus } from '@prisma/client';
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

  it('recovers the false reconciliation alert created by the legacy catalog-mapping path', async () => {
    const { prisma, gateway, service } = setup();
    prisma.order.findMany.mockResolvedValue([{
      id: 'order-a', orderNumber: '100', status: OrderStatus.confirmed, createdAt: new Date(),
      marketplaceOrders: [{
        operations: [],
        divergences: [{
          id: 'legacy-catalog', type: MarketplaceDivergenceType.UNKNOWN_EXTERNAL_STATE,
          operationId: null, internalOrderId: null,
          reason: 'Marketplace catalog items are unmapped: app-item-99',
          recommendedAction: 'Map each marketplace app item ID to a tenant catalog product before inventory can be depleted.',
        }],
      }],
    }]);
    prisma.orderAlert.findMany.mockResolvedValue([{ id: 'alert-legacy', fingerprint: 'order-a:PROVIDER_RECONCILIATION_FAILED' }]);
    prisma.orderAlert.update.mockResolvedValue({ id: 'alert-legacy' });

    await service.refreshTenant(tenantId);

    expect(prisma.orderAlert.create).not.toHaveBeenCalled();
    expect(prisma.orderAlert.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'alert-legacy' }, data: expect.objectContaining({ state: OrderAlertState.RECOVERED }),
    }));
    expect(gateway.emitOrderAlertChanged).toHaveBeenCalledWith(tenantId, 'alert-legacy', 'RECOVERED', 'recovered');
  });

  it('keeps a real unknown-provider divergence eligible for a critical reconciliation alert', async () => {
    const { prisma, service } = setup();
    prisma.order.findMany.mockResolvedValue([{
      id: 'order-a', orderNumber: '100', status: OrderStatus.confirmed, createdAt: now,
      marketplaceOrders: [{
        operations: [],
        divergences: [{
          id: 'unknown-777', type: MarketplaceDivergenceType.UNKNOWN_EXTERNAL_STATE,
          operationId: 'operation-a', internalOrderId: 'order-a', reason: '99Food returned unknown native status 777.',
          recommendedAction: 'Inspect the sanitized provider response and retry reconciliation after validation.',
        }],
      }],
    }]);
    prisma.orderAlert.findFirst.mockResolvedValue(null);
    prisma.orderAlert.create.mockResolvedValue({ id: 'alert-unknown' });
    prisma.orderAlert.findMany.mockResolvedValue([]);

    await service.refreshTenant(tenantId);

    expect(prisma.orderAlert.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      ruleKey: 'PROVIDER_RECONCILIATION_FAILED', severity: OrderAlertSeverity.CRITICAL,
    }) }));
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
