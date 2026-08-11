import { WsException } from '@nestjs/websockets';
import { DeliveryTrackingGateway } from './delivery-tracking.gateway';

describe('DeliveryTrackingGateway driver authentication', () => {
  const driversService = { updateDriverLocation: jest.fn() };
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
    await gateway.handleUpdateDriverLocation({ lat: -23.5, lng: -46.6 }, socket as never);

    expect(driverAuthService.validateAccessToken).toHaveBeenCalledTimes(2);
    expect(driverAuthService.validateAccessToken).toHaveBeenCalledWith('access-token');
    expect(socket.join).toHaveBeenCalledWith('driver:tenant-a:driver-a');
    expect(driversService.updateDriverLocation).toHaveBeenCalledWith(
      'tenant-a',
      'driver-a',
      { lat: -23.5, lng: -46.6 },
    );
  });

  it('rejects location updates from a public or unauthenticated socket', async () => {
    const socket = { data: {} };
    await expect(gateway.handleUpdateDriverLocation({ lat: -23.5, lng: -46.6 }, socket as never))
      .rejects.toBeInstanceOf(WsException);
    expect(driversService.updateDriverLocation).not.toHaveBeenCalled();
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
