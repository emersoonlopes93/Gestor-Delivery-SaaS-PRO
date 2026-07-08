import { ForbiddenException } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard tenant RBAC', () => {
  const makeGuard = (requiredPermissions: string[], userPermissions: string[], userRoles: string[]) => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValueOnce(undefined)
        .mockReturnValueOnce(requiredPermissions),
    };
    const rbac = {
      getUserPermissions: jest.fn().mockResolvedValue(userPermissions),
      getUserRoles: jest.fn().mockResolvedValue(userRoles),
    };
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { sub: 'tenant-user-1', type: 'tenant' },
        }),
      }),
    };

    return {
      guard: new PermissionsGuard(reflector as never, rbac as never),
      context,
    };
  };

  it('allows tenant owners to bypass granular permission checks', async () => {
    const { guard, context } = makeGuard(['billing.write'], [], ['tenant_owner']);

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });

  it('blocks users without the required permission', async () => {
    const { guard, context } = makeGuard(['users.delete'], ['users.read'], ['manager']);

    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
