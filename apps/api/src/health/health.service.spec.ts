import { ChatGateway } from '../chat/chat.gateway';
import { DeliveryTrackingGateway } from '../delivery/delivery-tracking.gateway';
import { OrdersGateway } from '../orders/orders.gateway';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

type GatewayWithEngine = {
  server?: {
    engine?: { clientsCount?: number };
    server?: { engine?: { clientsCount?: number } };
  };
};

describe('HealthService readiness WebSocket diagnostics', () => {
  const originalGateways = {
    orders: OrdersGateway.instance,
    delivery: DeliveryTrackingGateway.instance,
    chat: ChatGateway.instance,
  };
  const originalRedisEnabled = process.env.REDIS_ENABLED;
  const originalBullmqEnabled = process.env.BULLMQ_ENABLED;
  const prisma = {
    isHealthy: jest.fn<Promise<boolean>, []>(),
    $queryRawUnsafe: jest.fn(),
  };
  const service = new HealthService(prisma as never);

  const setGatewayInstances = (
    orders: GatewayWithEngine | null,
    delivery: GatewayWithEngine | null,
    chat: GatewayWithEngine | null,
  ) => {
    OrdersGateway.instance = orders as OrdersGateway | null;
    DeliveryTrackingGateway.instance = delivery as DeliveryTrackingGateway | null;
    ChatGateway.instance = chat as ChatGateway | null;
  };

  beforeEach(() => {
    process.env.REDIS_ENABLED = 'false';
    process.env.BULLMQ_ENABLED = 'false';
    prisma.isHealthy.mockResolvedValue(true);
    setGatewayInstances(
      { server: { server: { engine: { clientsCount: 2 } } } },
      { server: { server: { engine: { clientsCount: 3 } } } },
      { server: { server: { engine: { clientsCount: 5 } } } },
    );
  });

  afterAll(() => {
    OrdersGateway.instance = originalGateways.orders;
    DeliveryTrackingGateway.instance = originalGateways.delivery;
    ChatGateway.instance = originalGateways.chat;
    process.env.REDIS_ENABLED = originalRedisEnabled;
    process.env.BULLMQ_ENABLED = originalBullmqEnabled;
  });

  it('reports active gateways with their connection counts', async () => {
    const readiness = await service.getReadiness();

    expect(readiness.status).toBe('ok');
    expect(readiness.details.websocket).toEqual({
      ordersGateway: { active: true, clientsCount: 2, reason: null },
      deliveryGateway: { active: true, clientsCount: 3, reason: null },
      chatGateway: { active: true, clientsCount: 5, reason: null },
    });
  });

  it('reports a mandatory gateway that has not been instantiated without throwing', async () => {
    setGatewayInstances(
      null,
      { server: { server: { engine: { clientsCount: 3 } } } },
      { server: { server: { engine: { clientsCount: 5 } } } },
    );

    await expect(service.getReadiness()).resolves.toMatchObject({
      status: 'degraded',
      services: { websocket: 'degraded' },
      details: {
        websocket: {
          ordersGateway: { active: false, clientsCount: null, reason: 'gateway_not_initialized' },
        },
      },
    });
  });

  it('keeps disabled Redis and BullMQ independent from WebSocket readiness', async () => {
    setGatewayInstances(null, null, null);

    const readiness = await service.getReadiness();

    expect(readiness.status).toBe('degraded');
    expect(readiness.services).toMatchObject({ redis: 'disabled', bullmq: 'disabled', websocket: 'degraded' });
    expect(readiness.details.websocket.chatGateway).toEqual({
      active: false,
      clientsCount: null,
      reason: 'gateway_not_initialized',
    });
  });

  it('reports every uninitialized gateway when more than one is not ready', async () => {
    setGatewayInstances({ server: {} }, null, { server: { engine: { clientsCount: 5 } } });

    const readiness = await service.getReadiness();

    expect(readiness.status).toBe('degraded');
    expect(readiness.details.websocket.ordersGateway).toEqual({
      active: false,
      clientsCount: null,
      reason: 'engine_not_initialized',
    });
    expect(readiness.details.websocket.deliveryGateway).toEqual({
      active: false,
      clientsCount: null,
      reason: 'gateway_not_initialized',
    });
  });
});

describe('HealthController liveness', () => {
  it('remains independent from readiness dependencies', () => {
    const controller = new HealthController({} as never, {} as never);

    expect(controller.checkLiveness()).toEqual({ status: 'ok' });
  });
});
