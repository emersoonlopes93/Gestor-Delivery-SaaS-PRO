import { ForbiddenException } from '@nestjs/common';
import { AdminPermissionsGuard } from './admin-permissions.guard';

describe('AdminPermissionsGuard base menu RBAC', () => {
  const makeGuard = (requiredPermissions: string[], userPermissions: string[]) => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(requiredPermissions),
    };
    const rbac = {
      getUserPermissions: jest.fn().mockResolvedValue(userPermissions),
    };
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue({
          user: { sub: 'admin-1', type: 'admin' },
        }),
      }),
    };

    return {
      guard: new AdminPermissionsGuard(reflector as never, rbac as never),
      context,
    };
  };

  it('allows read users to access base menu read routes', async () => {
    const { guard, context } = makeGuard(['saas.base_menu.read'], ['saas.base_menu.read']);

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });

  it('blocks read-only users from base menu manage routes', async () => {
    const { guard, context } = makeGuard(['saas.base_menu.manage'], ['saas.base_menu.read']);

    await expect(guard.canActivate(context as never)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows manage users to create, edit and publish base menu drafts', async () => {
    const { guard, context } = makeGuard(['saas.base_menu.manage'], ['saas.base_menu.read', 'saas.base_menu.manage']);

    await expect(guard.canActivate(context as never)).resolves.toBe(true);
  });
});
