import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { DriverAuthGuard } from './driver-auth.guard';

describe('DriverAuthGuard', () => {
  it('restores the verified tenant-bound driver context without slug', async () => {
    const driverAuthService = {
      validateAccessToken: jest.fn().mockResolvedValue({
        sub: 'driver-a',
        tenantId: 'tenant-a',
        sid: 'session-a',
        type: 'driver',
        phone: '5511999999999',
        name: 'Driver A',
      }),
    };
    const request = { headers: { authorization: 'Bearer access-token' } };
    const context = Object.assign(Object.create(null) as ExecutionContext, {
      switchToHttp: () => ({ getRequest: () => request }),
    });
    const guard = new DriverAuthGuard(driverAuthService as never);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request).toEqual(expect.objectContaining({
      tenantId: 'tenant-a',
      user: expect.objectContaining({ id: 'driver-a', sub: 'driver-a', tenantId: 'tenant-a' }),
    }));
  });

  it('rejects requests without an access token', async () => {
    const context = Object.assign(Object.create(null) as ExecutionContext, {
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    });
    const guard = new DriverAuthGuard({ validateAccessToken: jest.fn() } as never);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
