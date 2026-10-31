import { WsException } from '@nestjs/websockets';
import { DeliveryTrackingGateway } from './delivery-tracking.gateway';

describe('DeliveryTrackingGateway driver authentication', () => {
  const driversService = { ingestDriverLocations: jest.fn() };
  const driverAuthService = { validateAccessToken: jest.fn() };
  const tenantSocketAuth = { validateAccessToken: jest.fn() };
  const publicTrackingAccess = { isValidToken: jest.fn() };
  let gateway: DeliveryTrackingGateway;

  beforeEach(() => {
    jest.clearAllMocks();
    tenantSocketAuth.validateAccessToken.mockRejectedValue(new Error('not a tenant token'));
    publicTrackingAccess.isValidToken.mockResolvedValue(true);
    gateway = new DeliveryTrackingGateway(
      driversService as never,
      driverAuthService as never,
      tenantSocketAuth as never,
      publicTrackingAccess as never,
    );
    gateway.server = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) } as never;
  });

  it('binds a driver socket to verified JWT claims and ignores client identity input', async () => {
    driverAuthService.validateAccessToken.mockResolvedValue({ sub: 'driver-a', tenantId: 'tenant-a', sid: 'sid-a' });
    const socket = {
      id: 'socket-a',
      handshake: { auth: { token: 'access-token' } },
      data: {},
      disconnect: jest.fn(),
      join: jest.fn(),
    };

    await gateway.handleConnection(socket as never);
    const point = {
      eventKey: 'point-a',
      recordedAt: '2026-08-12T12:00:00.000Z',
      lat: -23.5,
      lng: -46.6,
      source: 'foreground',
    } as const;
    await gateway.handleUpdateDriverLocation(point, socket as never);

    expect(driverAuthService.validateAccessToken).toHaveBeenCalledTimes(2);
    expect(driverAuthService.validateAccessToken).toHaveBeenCalledWith('access-token');
    expect(socket.join).toHaveBeenCalledWith('driver:tenant-a:driver-a');
    expect(driversService.ingestDriverLocations).toHaveBeenCalledWith(
      'tenant-a',
      'driver-a',
      [point],
    );
  });

  it('rejects location updates from a public or unauthenticated socket', async () => {
    const socket = { data: {} };
    await expect(gateway.handleUpdateDriverLocation({
      eventKey: 'point-a',
      recordedAt: '2026-08-12T12:00:00.000Z',
      lat: -23.5,
      lng: -46.6,
      source: 'foreground',
    }, socket as never))
      .rejects.toBeInstanceOf(WsException);
    expect(driversService.ingestDriverLocations).not.toHaveBeenCalled();
  });

  it('does not persist a point after the driver session is revoked', async () => {
    driverAuthService.validateAccessToken.mockRejectedValue(new Error('revoked'));
    const socket = {
      data: { driverAccess: { token: 'revoked-token', tenantId: 'tenant-a', driverId: 'driver-a' } },
    };
    await expect(gateway.handleUpdateDriverLocation({
      eventKey: 'point-a', recordedAt: '2026-08-12T12:00:00.000Z',
      lat: -23.5, lng: -46.6, source: 'foreground',
    }, socket as never)).rejects.toBeInstanceOf(WsException);
    expect(driversService.ingestDriverLocations).not.toHaveBeenCalled();
  });

  it('disconnects when a supplied driver token is invalid', async () => {
    driverAuthService.validateAccessToken.mockRejectedValue(new Error('invalid'));
    const socket = {
      id: 'socket-a',
      handshake: { auth: { token: 'invalid-token' } },
      data: {},
      disconnect: jest.fn(),
    };
    await gateway.handleConnection(socket as never);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('emits a private assignment only to the tenant-scoped driver room', () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    gateway.server = { to } as never;
    const event = {
      eventId: 'delivery.assigned:order-a:1',
      type: 'delivery.assigned',
      orderId: 'order-a',
      orderNumber: '101',
      status: 'ready_for_delivery',
      occurredAt: '2026-08-11T00:00:00.000Z',
    } as const;

    gateway.emitDriverDeliveryEvent('tenant-a', 'driver-a', event);

    expect(to).toHaveBeenCalledTimes(1);
    expect(to).toHaveBeenCalledWith('driver:tenant-a:driver-a');
    expect(to).not.toHaveBeenCalledWith('driver:tenant-a:driver-b');
    expect(to).not.toHaveBeenCalledWith('driver:tenant-b:driver-a');
    expect(emit).toHaveBeenCalledWith('driverDeliveryEvent', event);
  });

  it('emits canonical route updates only to the tenant-scoped driver room', () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    gateway.server = { to } as never;
    const event = {
      eventId: 'delivery.run_updated:run-a:1',
      type: 'delivery.run_updated',
      change: 'reordered',
      runId: 'run-a',
      occurredAt: '2026-08-11T00:00:00.000Z',
    } as const;

    gateway.emitDriverRouteEvent('tenant-a', 'driver-a', event);

    expect(to).toHaveBeenCalledTimes(1);
    expect(to).toHaveBeenCalledWith('driver:tenant-a:driver-a');
    expect(to).not.toHaveBeenCalledWith('driver:tenant-a:driver-b');
    expect(to).not.toHaveBeenCalledWith('driver:tenant-b:driver-a');
    expect(emit).toHaveBeenCalledWith('driverRouteEvent', event);
  });

  it('disconnects only sockets from the revoked session', () => {
    const sessionX = { data: { authSessionId: 'sid-x' }, disconnect: jest.fn() };
    const sessionY = { data: { authSessionId: 'sid-y' }, disconnect: jest.fn() };
    gateway.server = {
      sockets: { sockets: new Map([['x', sessionX], ['y', sessionY]]) },
    } as never;

    gateway.handleSessionRevoked({ sessionId: 'sid-x' });

    expect(sessionX.disconnect).toHaveBeenCalledWith(true);
    expect(sessionY.disconnect).not.toHaveBeenCalled();
  });
});
