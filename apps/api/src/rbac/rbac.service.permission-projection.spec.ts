import { RbacService } from './rbac.service';

describe('RbacService response projection permission checks', () => {
  const createService = (permissions: string[], roles: string[]) => {
    const service = Object.create(RbacService.prototype) as RbacService;
    jest.spyOn(service, 'getUserPermissions').mockResolvedValue(permissions);
    jest.spyOn(service, 'getUserRoles').mockResolvedValue(roles);
    return service;
  };

  it.each([
    { permissions: ['reports.view_costs'], roles: [], expected: true },
    { permissions: [], roles: ['tenant_owner'], expected: true },
    { permissions: [], roles: ['tenant_admin'], expected: true },
    { permissions: ['reports.read'], roles: ['manager'], expected: false },
  ])('uses the same elevated-role policy as PermissionsGuard', async ({ permissions, roles, expected }) => {
    const service = createService(permissions, roles);

    await expect(service.hasPermissionOrElevatedRole('user-a', 'reports.view_costs')).resolves.toBe(expected);
  });
});
