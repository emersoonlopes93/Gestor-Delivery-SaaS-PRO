import { MarketplaceOperationStatus, OrderAlertSeverity, OrderAlertState, OrderStatus } from '@prisma/client';
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
    prisma.order.findMany.mockResolvedValueOnce([{ id: 'order-a', orderNumber: '100', status: OrderStatus.pending, createdAt: now, marketplaceOrders: [] }]).mockResolvedValueOnce([]);
    prisma.orderAlert.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
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

  it('creates a critical alert only for an authoritative failed marketplace operation', async () => {
    const { prisma, service } = setup();
    prisma.order.findMany.mockResolvedValue([{ id: 'order-a', orderNumber: '100', status: OrderStatus.confirmed, createdAt: now, marketplaceOrders: [{ operations: [{ id: 'operation-a', status: MarketplaceOperationStatus.FAILED }], divergences: [] }] }]);
    prisma.orderAlert.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    prisma.orderAlert.create.mockResolvedValue({ id: 'alert-a' });
    prisma.orderAlert.findMany.mockResolvedValue([]);

    await service.refreshTenant(tenantId);

    expect(prisma.orderAlert.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ ruleKey: 'ORDER_SYNC_FAILED', severity: OrderAlertSeverity.CRITICAL }) }));
  });
});
