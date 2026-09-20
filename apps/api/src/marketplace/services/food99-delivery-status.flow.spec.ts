import { createHash } from 'crypto';
import { MarketplaceDeliveryOwnership, MarketplaceEventStatus, MarketplaceProvider, OrderStatus } from '@prisma/client';
import { MarketplaceWebhookController } from '../controllers/marketplace-webhook.controller';
import { Food99Provider } from '../providers/food99.provider';
import { MarketplaceEventInboxService } from './marketplace-event-inbox.service';
import { MarketplaceOrderIngestionService } from './marketplace-order-ingestion.service';

const externalOrderId = '5764607618872501234';
const connection = { id: 'connection-1', tenantId: 'tenant-1', provider: MarketplaceProvider.FOOD_99 };

function createFlow() {
  const provider = new Food99Provider({} as never, {
    getFood99AppCredentials: () => ({ appId: '5764608647577512345', clientSecret: 'test-secret' }),
  } as never);
  const registry = { get: () => provider, parseProvider: () => MarketplaceProvider.FOOD_99 };
  const inboxRows = new Map<string, Record<string, unknown>>();
  let lastEventAt: Date | null = null;
  let lastEventTopic: string | null = null;
  let logistics: Record<string, unknown> = {};
  let status: OrderStatus = OrderStatus.preparing;
  const timeline: string[] = [];
  const gateway = { emitOrderChanged: jest.fn(), emitNewOrder: jest.fn() };
  const alertRefresh = jest.fn().mockResolvedValue(undefined);
  const statusSync = { reconcileExternalEvent: jest.fn().mockResolvedValue(undefined) };
  const divergence = { record: jest.fn().mockResolvedValue(undefined) };
  const tx = {
    orderTimeline: { create: jest.fn(async ({ data }: { data: { status: string } }) => { timeline.push(data.status); return {}; }) },
    marketplaceOrder: { updateMany: jest.fn(async ({ data }: { data: { statusInternal?: string } }) => ({ count: data.statusInternal ? 1 : 0 })) },
  };
  const ordersService = {
    applyOrderStatusTransitionInTransaction: jest.fn(async (_tx: unknown, input: {
      tenantId: string; expectedCurrentStatus: OrderStatus; targetStatus: OrderStatus; transitionPolicy: string;
    }) => {
      if (input.tenantId !== connection.tenantId || input.expectedCurrentStatus !== status || input.transitionPolicy !== 'food99_authoritative') {
        throw new Error('canonical CAS rejected the transition');
      }
      status = input.targetStatus;
      return {};
    }),
    updateOrderStatus: jest.fn(),
  };
  const prisma = {
    marketplaceEventInbox: {
      findFirst: jest.fn(async ({ where }: { where: { OR?: Array<{ dedupeKey: string }> } }) => {
        const key = where.OR?.[0]?.dedupeKey;
        return [...inboxRows.values()].find((row) => row.dedupeKey === key) ?? null;
      }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { ...data, id: `inbox-${inboxRows.size + 1}`, connection, attempts: 0 };
        inboxRows.set(row.id, row);
        return row;
      }),
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => inboxRows.get(where.id) ?? null),
      updateMany: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = inboxRows.get(where.id);
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = inboxRows.get(where.id);
        if (!row) throw new Error('inbox row missing');
        Object.assign(row, data);
        return row;
      }),
    },
    marketplaceOrder: {
      findFirst: jest.fn(async ({ where, select }: { where: { tenantId?: string; externalOrderId: string }; select?: Record<string, unknown> }) => {
        if (where.tenantId && where.tenantId !== connection.tenantId) return null;
        if (where.externalOrderId !== externalOrderId) return null;
        if (select?.lastExternalEventAt) return {
          lastExternalEventAt: lastEventAt, lastExternalEventSequence: null, lastExternalEventTopic: lastEventTopic,
          normalizedPayload: { logistics },
        };
        return {
          id: 'marketplace-order-1', internalOrderId: 'order-1', provider: MarketplaceProvider.FOOD_99,
          deliveryOwnership: MarketplaceDeliveryOwnership.PROVIDER, normalizedPayload: { logistics },
        };
      }),
      updateMany: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (data.lastExternalEventAt instanceof Date) lastEventAt = data.lastExternalEventAt;
        if (typeof data.lastExternalEventTopic === 'string') lastEventTopic = data.lastExternalEventTopic;
        if (data.normalizedPayload && typeof data.normalizedPayload === 'object' && 'logistics' in data.normalizedPayload) {
          logistics = data.normalizedPayload.logistics as Record<string, unknown>;
        }
        return { count: 1 };
      }),
    },
    order: { findFirst: jest.fn(async ({ where }: { where: { tenantId: string } }) => (
      where.tenantId === connection.tenantId ? { status, fulfillmentType: 'delivery' } : null
    )) },
    $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<void>) => callback(tx)),
  };
  const ingestion = new MarketplaceOrderIngestionService(
    prisma as never, registry as never, {} as never, {} as never, gateway as never,
    ordersService as never, statusSync as never, divergence as never, {} as never, {} as never,
    { refreshTenant: alertRefresh } as never,
  );
  const inbox = new MarketplaceEventInboxService(
    prisma as never, registry as never,
    { resolveConnection: jest.fn().mockResolvedValue(connection) } as never, ingestion,
    undefined,
  );
  const controller = new MarketplaceWebhookController(registry as never, inbox);

  const send = async (deliveryStatus: number, timestamp: number, signatureValid = true) => {
    const rawBody = Buffer.from(`{"app_id":5764608647577512345,"app_shop_id":"store-99","type":"deliveryStatus","timestamp":${timestamp},"data":{"order_id":${externalOrderId},"delivery_status":${deliveryStatus}}}`);
    const signature = createHash('md5').update(rawBody).update('test-secret').digest('hex');
    const response = { status: jest.fn() };
    await controller.receiveWebhook(
      '99food', {}, { 'didi-header-sign': signatureValid ? signature : '0'.repeat(32) },
      { rawBody } as never, response as never,
    );
    return [...inboxRows.values()].at(-1);
  };
  return { send, inboxRows, prisma, ordersService, gateway, alertRefresh, divergence, timeline, getStatus: () => status, getLogistics: () => logistics };
}

describe('signed 99Food deliveryStatus webhook through inbox and canonical lifecycle', () => {
  it('processes 130 then 140 in the same second without deduping the pickup, and completes on 160', async () => {
    const flow = createFlow();
    const arrived = await flow.send(130, 1780000000);
    expect(arrived?.status).toBe(MarketplaceEventStatus.PROCESSED);
    expect(flow.getLogistics().deliveryStatus).toBe('130');
    expect(flow.getStatus()).toBe(OrderStatus.preparing);

    const pickedUp = await flow.send(140, 1780000000);
    expect(pickedUp?.status).toBe(MarketplaceEventStatus.PROCESSED);
    expect(flow.inboxRows.size).toBe(2);
    expect(flow.getStatus()).toBe(OrderStatus.out_for_delivery);
    expect(flow.ordersService.applyOrderStatusTransitionInTransaction).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      tenantId: 'tenant-1', expectedCurrentStatus: OrderStatus.preparing,
      targetStatus: OrderStatus.out_for_delivery, transitionPolicy: 'food99_authoritative',
    }));
    expect(flow.gateway.emitOrderChanged).toHaveBeenCalledWith('tenant-1', 'order-1', 'status');

    await flow.send(160, 1780000001);
    expect(flow.getStatus()).toBe(OrderStatus.completed);
    expect(flow.timeline).toEqual([OrderStatus.out_for_delivery, OrderStatus.completed]);
    expect(flow.alertRefresh).toHaveBeenCalledTimes(3);
  });

  it('keeps a delivery-only cancellation out of the commercial order lifecycle', async () => {
    const flow = createFlow();
    await flow.send(140, 1780000000);
    await flow.send(170, 1780000001);
    expect(flow.getStatus()).toBe(OrderStatus.out_for_delivery);
    expect(flow.divergence.record).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-1', remoteState: 'DELIVERY_STATUS_170',
    }));
  });

  it('rejects unsigned events and ignores stale or duplicate callbacks without a second transition', async () => {
    const flow = createFlow();
    await expect(flow.send(140, 1780000000, false)).rejects.toThrow('Invalid marketplace webhook signature.');
    expect(flow.inboxRows.size).toBe(0);
    await flow.send(140, 1780000000);
    await flow.send(140, 1780000000);
    expect(flow.inboxRows.size).toBe(1);
    await flow.send(130, 1779999999);
    expect(flow.getStatus()).toBe(OrderStatus.out_for_delivery);
    expect(flow.ordersService.applyOrderStatusTransitionInTransaction).toHaveBeenCalledTimes(1);
    expect(flow.getLogistics().deliveryStatus).toBe('140');
  });

  it('does not let a regressive later callback hide a valid intermediate completion', async () => {
    const flow = createFlow();
    await flow.send(140, 1780000000);
    const regressive = await flow.send(130, 1780000002);
    expect(regressive?.status).toBe(MarketplaceEventStatus.IGNORED);
    expect(flow.getLogistics().deliveryStatus).toBe('140');
    await flow.send(160, 1780000001);
    expect(flow.getStatus()).toBe(OrderStatus.completed);
    expect(flow.timeline).toEqual([OrderStatus.out_for_delivery, OrderStatus.completed]);
  });
});
