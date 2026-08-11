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
    driverAuthService.validateAccessToken.mockResolvedValue({ sub: 'driver-a', tenantId: 'tenant-a' });
    const socket = {
      id: 'socket-a',
      handshake: { auth: { token: 'access-token' } },
      data: {},
      disconnect: jest.fn(),
    };

    await gateway.handleConnection(socket as never);
    await gateway.handleUpdateDriverLocation({ lat: -23.5, lng: -46.6 }, socket as never);

    expect(driverAuthService.validateAccessToken).toHaveBeenCalledTimes(2);
    expect(driverAuthService.validateAccessToken).toHaveBeenCalledWith('access-token');
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
});
