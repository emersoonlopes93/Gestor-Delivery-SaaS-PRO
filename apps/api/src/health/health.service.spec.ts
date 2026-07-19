import { ChatGateway } from '../chat/chat.gateway';
import { DeliveryTrackingGateway } from '../delivery/delivery-tracking.gateway';
import { OrdersGateway } from '../orders/orders.gateway';
import { HealthController } from './health.controller';
import { HealthService, type QueueMetrics } from './health.service';

type GatewayWithEngine = {
  server?: {
    engine?: { clientsCount?: number };
    server?: { engine?: { clientsCount?: number } };
  };
};

const environmentKeys = ['REDIS_ENABLED', 'BULLMQ_ENABLED'] as const;

describe('HealthService readiness WebSocket diagnostics', () => {
  const originalGateways = {
    orders: OrdersGateway.instance,
    delivery: DeliveryTrackingGateway.instance,
    chat: ChatGateway.instance,
  };
  const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));
  const prisma = {
    isHealthy: jest.fn<Promise<boolean>, []>(),
    $queryRawUnsafe: jest.fn(),
  };
  const service = new HealthService(prisma as never);
  const healthInternals = service as unknown as {
    pingRedis: () => Promise<{ connected: boolean; latencyMs: number | null; reason: string | null }>;
    checkQueueHealth: (name: string, enabled: boolean) => Promise<QueueMetrics>;
  };

  const setGatewayInstances = (
    orders: GatewayWithEngine | null,
    delivery: GatewayWithEngine | null,
    chat: GatewayWithEngine | null,
  ) => {
    OrdersGateway.instance = orders as OrdersGateway | null;
    DeliveryTrackingGateway.instance = delivery as DeliveryTrackingGateway | null;
    ChatGateway.instance = chat as ChatGateway | null;
  };

  const setActiveGateways = () => setGatewayInstances(
    { server: { server: { engine: { clientsCount: 2 } } } },
    { server: { server: { engine: { clientsCount: 3 } } } },
    { server: { server: { engine: { clientsCount: 5 } } } },
  );

  const setEnvironment = (redisEnabled: boolean, bullmqEnabled: boolean) => {
    process.env.REDIS_ENABLED = String(redisEnabled);
    process.env.BULLMQ_ENABLED = String(bullmqEnabled);
  };

  const restoreEnvironment = () => {
    for (const key of environmentKeys) {
      const value = originalEnvironment.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };

  beforeEach(() => {
    jest.restoreAllMocks();
    prisma.isHealthy.mockReset();
    prisma.$queryRawUnsafe.mockReset();
    prisma.isHealthy.mockResolvedValue(true);
    setEnvironment(false, false);
    setActiveGateways();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    setGatewayInstances(originalGateways.orders, originalGateways.delivery, originalGateways.chat);
    restoreEnvironment();
  });

  it('reports ok when all configured dependencies are healthy', async () => {
    setEnvironment(true, true);
    jest.spyOn(healthInternals, 'pingRedis').mockResolvedValue({ connected: true, latencyMs: 1, reason: null });
    jest.spyOn(healthInternals, 'checkQueueHealth').mockImplementation(async (name): Promise<QueueMetrics> => ({
      name,
      status: 'ok',
      waiting: 0,
      active: 0,
      failed: 0,
      delayed: 0,
      error: null,
    }));

    const readiness = await service.getReadiness();

    expect(readiness.status).toBe('ok');
    expect(readiness.details.websocket).toEqual({
      ordersGateway: { active: true, clientsCount: 2, reason: null },
      deliveryGateway: { active: true, clientsCount: 3, reason: null },
      chatGateway: { active: true, clientsCount: 5, reason: null },
    });
  });

  it('reports disabled Redis and BullMQ as degraded without probing them', async () => {
    const redisProbe = jest.spyOn(healthInternals, 'pingRedis');
    const queueProbe = jest.spyOn(healthInternals, 'checkQueueHealth');

    const readiness = await service.getReadiness();

    expect(readiness.status).toBe('degraded');
    expect(readiness.services).toMatchObject({ redis: 'disabled', bullmq: 'disabled', websocket: 'ok' });
    expect(redisProbe).not.toHaveBeenCalled();
    expect(queueProbe).not.toHaveBeenCalled();
  });

  it('reports enabled but unavailable Redis and BullMQ as degraded', async () => {
    setEnvironment(true, true);
    jest.spyOn(healthInternals, 'pingRedis').mockResolvedValue({
      connected: false,
      latencyMs: null,
      reason: 'redis_health_connect_timeout',
    });

    const readiness = await service.getReadiness();

    expect(readiness.status).toBe('degraded');
    expect(readiness.services).toMatchObject({ redis: 'degraded', bullmq: 'degraded', websocket: 'ok' });
    expect(readiness.details.redis.reason).toBe('redis_health_connect_timeout');
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

  it('reports every uninitialized mandatory gateway with a structured reason', async () => {
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
