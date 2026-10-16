import { createServer, type Server as HttpServer } from 'node:http';
import { createRequire } from 'node:module';
import { Server, type Namespace, type Socket as ServerSocket } from 'socket.io';
import { OrdersGateway } from './orders.gateway';
import { DeliveryTrackingGateway } from '../delivery/delivery-tracking.gateway';

type Listener = (...args: unknown[]) => void;

interface TestSocketClient {
  on(event: string, listener: Listener): this;
  once(event: string, listener: Listener): this;
  off(event: string, listener: Listener): this;
  emit(event: string, ...args: unknown[]): this;
  disconnect(): this;
}

type SocketClientFactory = (
  uri: string,
  options: {
    transports: ['websocket'];
    forceNew: true;
    auth?: { token: string };
  },
) => TestSocketClient;

const webTenantRequire = createRequire(require.resolve('../../../web-tenant/package.json'));
const { io: createClient } = webTenantRequire('socket.io-client') as {
  io: SocketClientFactory;
};

function waitForEvent(client: TestSocketClient, event: string, timeoutMs = 2_000): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.off(event, listener);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const listener: Listener = (...args) => {
      clearTimeout(timeout);
      resolve(args);
    };
    client.once(event, listener);
  });
}

async function expectNoEvent(
  client: TestSocketClient,
  event: string,
  action: () => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const listener: Listener = () => {
      clearTimeout(timeout);
      reject(new Error(`Unexpected ${event} event`));
    };
    const timeout = setTimeout(() => {
      client.off(event, listener);
      resolve();
    }, 100);
    client.once(event, listener);
    action();
  });
}

describe('WebSocket tenant isolation with real Socket.IO clients', () => {
  let httpServer: HttpServer;
  let ioServer: Server;
  let origin: string;
  const clients: TestSocketClient[] = [];
  const revokedTenantTokens = new Set<string>();

  const tenantSocketAuth = {
    validateAccessToken: jest.fn(async (token: string) => {
      if (revokedTenantTokens.has(token)) throw new Error('revoked tenant session');
      if (token === 'tenant-a-token') {
        return { type: 'tenant', sub: 'user-a', tenantId: 'tenant-a', email: 'a@test.local', sid: 'sid-a' } as const;
      }
      if (token === 'tenant-b-token') {
        return { type: 'tenant', sub: 'user-b', tenantId: 'tenant-b', email: 'b@test.local', sid: 'sid-b' } as const;
      }
      throw new Error('invalid tenant session');
    }),
  };
  const publicTrackingAccess = {
    isValidToken: jest.fn(async (token: string) => ['order-a-token', 'order-b-token'].includes(token)),
  };
  const driverAuthService = {
    validateAccessToken: jest.fn(async (token: string) => {
      if (token === 'driver-a-token') {
        return { type: 'driver', sub: 'driver-a', tenantId: 'tenant-a', sid: 'driver-sid-a' } as const;
      }
      if (token === 'driver-b-token') {
        return { type: 'driver', sub: 'driver-b', tenantId: 'tenant-a', sid: 'driver-sid-b' } as const;
      }
      if (token === 'driver-cross-token') {
        return { type: 'driver', sub: 'driver-a', tenantId: 'tenant-b', sid: 'driver-sid-cross' } as const;
      }
      throw new Error('not a driver token');
    }),
  };
  const driversService = { updateDriverLocation: jest.fn() };

  function registerOrdersNamespace(namespace: Namespace, gateway: OrdersGateway) {
    namespace.on('connection', async (socket: ServerSocket) => {
      await gateway.handleConnection(socket);
      if (!socket.connected) return;
      socket.on('joinTenant', async (data: { tenantId: string }) => {
        try {
          await gateway.handleJoinTenant(data, socket);
          socket.emit('test.joinedTenant');
        } catch {
          socket.emit('test.rejected');
        }
      });
      socket.on('joinOrder', async (data: { token: string }) => {
        try {
          await gateway.handleJoinOrder(data, socket);
          socket.emit('test.joinedOrder');
        } catch {
          socket.emit('test.rejected');
        }
      });
      socket.emit('test.ready');
    });
  }

  function registerDeliveryNamespace(namespace: Namespace, gateway: DeliveryTrackingGateway) {
    namespace.on('connection', async (socket: ServerSocket) => {
      await gateway.handleConnection(socket);
      if (!socket.connected) return;
      socket.on('joinTenantTracking', async (data: { tenantId: string }) => {
        try {
          await gateway.handleJoinTenantTracking(data, socket);
          socket.emit('test.joinedTenant');
        } catch {
          socket.emit('test.rejected');
        }
      });
      socket.on('joinTracking', async (data: { token: string }) => {
        try {
          await gateway.handleJoinTracking(data, socket);
          socket.emit('test.joinedOrder');
        } catch {
          socket.emit('test.rejected');
        }
      });
      socket.emit('test.ready');
    });
  }

  async function connect(namespace: 'orders' | 'delivery', token?: string) {
    const client = createClient(`${origin}/${namespace}`, {
      transports: ['websocket'],
      forceNew: true,
      ...(token ? { auth: { token } } : {}),
    });
    clients.push(client);
    await waitForEvent(client, 'test.ready');
    return client;
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    revokedTenantTokens.clear();
    httpServer = createServer();
    ioServer = new Server(httpServer);

    const ordersGateway = new OrdersGateway(
      tenantSocketAuth as never,
      publicTrackingAccess as never,
    );
    const deliveryGateway = new DeliveryTrackingGateway(
      driversService as never,
      driverAuthService as never,
      tenantSocketAuth as never,
      publicTrackingAccess as never,
    );
    const ordersNamespace = ioServer.of('/orders');
    const deliveryNamespace = ioServer.of('/delivery');
    ordersGateway.server = ordersNamespace as never;
    deliveryGateway.server = deliveryNamespace as never;
    registerOrdersNamespace(ordersNamespace, ordersGateway);
    registerDeliveryNamespace(deliveryNamespace, deliveryGateway);

    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const address = httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Test server did not bind');
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    clients.splice(0).forEach((client) => client.disconnect());
    await new Promise<void>((resolve) => ioServer.close(() => resolve()));
  });

  it('/orders blocks unauthenticated and forged tenant joins without leaking real events', async () => {
    const tenantA = await connect('orders', 'tenant-a-token');
    const joinedA = waitForEvent(tenantA, 'test.joinedTenant');
    tenantA.emit('joinTenant', { tenantId: 'tenant-a' });
    await joinedA;

    const receivedA = waitForEvent(tenantA, 'tenant.event');
    ioServer.of('/orders').to('tenant:tenant-a').emit('tenant.event', { tenantId: 'tenant-a' });
    await expect(receivedA).resolves.toEqual([{ tenantId: 'tenant-a' }]);

    const rejectedCrossTenant = waitForEvent(tenantA, 'test.rejected');
    tenantA.emit('joinTenant', { tenantId: 'tenant-b' });
    await rejectedCrossTenant;
    await expectNoEvent(tenantA, 'tenant.event', () => {
      ioServer.of('/orders').to('tenant:tenant-b').emit('tenant.event', { tenantId: 'tenant-b' });
    });

    const publicClient = await connect('orders');
    const rejectedUnauthenticated = waitForEvent(publicClient, 'test.rejected');
    publicClient.emit('joinTenant', { tenantId: 'tenant-a' });
    await rejectedUnauthenticated;
    await expectNoEvent(publicClient, 'tenant.event', () => {
      ioServer.of('/orders').to('tenant:tenant-a').emit('tenant.event', { tenantId: 'tenant-a' });
    });
  });

  it('/delivery separates authenticated tenant rooms from one bound public order token', async () => {
    const tenantA = await connect('delivery', 'tenant-a-token');
    const joinedA = waitForEvent(tenantA, 'test.joinedTenant');
    tenantA.emit('joinTenantTracking', { tenantId: 'tenant-a' });
    await joinedA;

    const receivedA = waitForEvent(tenantA, 'driverLocationUpdated');
    ioServer.of('/delivery').to('tenant:tenant-a').emit('driverLocationUpdated', { tenantId: 'tenant-a' });
    await expect(receivedA).resolves.toEqual([{ tenantId: 'tenant-a' }]);

    const rejectedCrossTenant = waitForEvent(tenantA, 'test.rejected');
    tenantA.emit('joinTenantTracking', { tenantId: 'tenant-b' });
    await rejectedCrossTenant;
    await expectNoEvent(tenantA, 'driverLocationUpdated', () => {
      ioServer.of('/delivery').to('tenant:tenant-b').emit('driverLocationUpdated', { tenantId: 'tenant-b' });
    });

    const publicOrderA = await connect('delivery');
    const joinedOrderA = waitForEvent(publicOrderA, 'test.joinedOrder');
    publicOrderA.emit('joinTracking', { token: 'order-a-token' });
    await joinedOrderA;

    const receivedOrderA = waitForEvent(publicOrderA, 'locationUpdate');
    ioServer.of('/delivery').to('order:order-a-token').emit('locationUpdate', { order: 'a' });
    await expect(receivedOrderA).resolves.toEqual([{ order: 'a' }]);
    await expectNoEvent(publicOrderA, 'locationUpdate', () => {
      ioServer.of('/delivery').to('order:order-b-token').emit('locationUpdate', { order: 'b' });
    });

    const rejectedOtherOrder = waitForEvent(publicOrderA, 'test.rejected');
    publicOrderA.emit('joinTracking', { token: 'order-b-token' });
    await rejectedOtherOrder;

    const rejectedEscalation = waitForEvent(publicOrderA, 'test.rejected');
    publicOrderA.emit('joinTenantTracking', { tenantId: 'tenant-a' });
    await rejectedEscalation;
    await expectNoEvent(publicOrderA, 'driverLocationUpdated', () => {
      ioServer.of('/delivery').to('tenant:tenant-a').emit('driverLocationUpdated', { tenantId: 'tenant-a' });
    });

    const concurrentPublic = await connect('delivery');
    const joinedConcurrentOrder = waitForEvent(concurrentPublic, 'test.joinedOrder');
    const rejectedConcurrentOrder = waitForEvent(concurrentPublic, 'test.rejected');
    concurrentPublic.emit('joinTracking', { token: 'order-a-token' });
    concurrentPublic.emit('joinTracking', { token: 'order-b-token' });
    await Promise.all([joinedConcurrentOrder, rejectedConcurrentOrder]);
    await expectNoEvent(concurrentPublic, 'locationUpdate', () => {
      ioServer.of('/delivery').to('order:order-b-token').emit('locationUpdate', { order: 'b' });
    });
  });

  it('/delivery sends a private assignment only to the authenticated driver in its tenant', async () => {
    const driverA = await connect('delivery', 'driver-a-token');
    const driverB = await connect('delivery', 'driver-b-token');
    const crossTenantDriver = await connect('delivery', 'driver-cross-token');
    const assignment = { eventId: 'assignment-a', orderId: 'order-a' };

    const receivedByA = waitForEvent(driverA, 'driverDeliveryEvent');
    await expectNoEvent(driverB, 'driverDeliveryEvent', () => {
      ioServer.of('/delivery')
        .to('driver:tenant-a:driver-a')
        .emit('driverDeliveryEvent', assignment);
    });
    await expect(receivedByA).resolves.toEqual([assignment]);

    await expectNoEvent(crossTenantDriver, 'driverDeliveryEvent', () => {
      ioServer.of('/delivery')
        .to('driver:tenant-a:driver-a')
        .emit('driverDeliveryEvent', assignment);
    });
  });

  it('revalidates the tenant session before a sensitive room join', async () => {
    const tenantA = await connect('orders', 'tenant-a-token');
    revokedTenantTokens.add('tenant-a-token');

    const rejectedRevokedSession = waitForEvent(tenantA, 'test.rejected');
    tenantA.emit('joinTenant', { tenantId: 'tenant-a' });
    await rejectedRevokedSession;
    await expectNoEvent(tenantA, 'tenant.event', () => {
      ioServer.of('/orders').to('tenant:tenant-a').emit('tenant.event', { tenantId: 'tenant-a' });
    });
  });
});
