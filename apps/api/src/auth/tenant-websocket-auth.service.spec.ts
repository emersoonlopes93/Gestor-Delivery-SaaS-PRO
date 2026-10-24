import { UnauthorizedException } from '@nestjs/common';
import { TenantWebSocketAuthService } from './tenant-websocket-auth.service';

describe('TenantWebSocketAuthService', () => {
  const jwtService = { verifyAsync: jest.fn() };
  const jwtStrategy = { validate: jest.fn() };
  let service: TenantWebSocketAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    jwtStrategy.validate.mockImplementation(async (payload: unknown) => payload);
    service = new TenantWebSocketAuthService(jwtService as never, jwtStrategy as never);
  });

  it('reuses canonical JWT/session validation for a session-bound tenant token', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      type: 'tenant',
      sub: 'user-a',
      tenantId: 'tenant-a',
      email: 'a@test.local',
      sid: 'session-a',
    });

    await expect(service.validateAccessToken('access-token')).resolves.toMatchObject({
      sub: 'user-a',
      tenantId: 'tenant-a',
      sid: 'session-a',
    });
    expect(jwtStrategy.validate).toHaveBeenCalledWith(expect.objectContaining({ sid: 'session-a' }));
  });

  it('rejects a legacy tenant JWT without a session', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      type: 'tenant',
      sub: 'user-a',
      tenantId: 'tenant-a',
      email: 'a@test.local',
    });

    await expect(service.validateAccessToken('legacy-token'))
      .rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwtStrategy.validate).not.toHaveBeenCalled();
  });

  it('preserves the explicit, short-lived support impersonation flow', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      type: 'tenant',
      sub: 'user-a',
      tenantId: 'tenant-a',
      email: 'a@test.local',
      isImpersonated: true,
      impersonatedBy: 'admin-a',
    });

    await expect(service.validateAccessToken('impersonation-token')).resolves.toMatchObject({
      tenantId: 'tenant-a',
      isImpersonated: true,
      impersonatedBy: 'admin-a',
    });
    expect(jwtStrategy.validate).toHaveBeenCalledTimes(1);
  });
});
