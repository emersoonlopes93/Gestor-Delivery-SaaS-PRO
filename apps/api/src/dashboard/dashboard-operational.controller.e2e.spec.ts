import { ExecutionContext, HttpStatus, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PERMISSIONS_KEY } from '../common/decorators';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { RbacService } from '../rbac/rbac.service';
import { DashboardOperationalController } from './dashboard-operational.controller';
import { DashboardOperationalService } from './dashboard-operational.service';

type TestProfile = 'dashboard-only' | 'reports-only' | 'none';

class HeaderTenantAuthGuard {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: { sub: string; tenantId: string; type: string } }>();
    const profile = request.headers['x-test-profile'] as TestProfile | undefined;
    if (!profile) throw new UnauthorizedException('Tenant authentication required');
    request.user = { sub: profile, tenantId: 'tenant-a', type: 'tenant' };
    return true;
  }
}

const hasSensitiveKey = (value: unknown): boolean => {
  const forbidden = new Set([
    'cost', 'costs', 'cmv', 'estimatedcost', 'grossprofit', 'grossmargin', 'marginpercentage',
    'profitability', 'financial', 'balance', 'cashbalance', 'netcashflow', 'settlement', 'payout', 'insights',
  ]);
  if (Array.isArray(value)) return value.some(hasSensitiveKey);
  if (typeof value !== 'object' || value === null) return false;
  return Object.entries(value).some(([key, nested]) => forbidden.has(key.toLowerCase()) || hasSensitiveKey(nested));
};

describe('DashboardOperationalController (HTTP authorization contract)', () => {
  let app: INestApplication;
  const snapshot = {
    period: { from: '2026-10-01', to: '2026-10-01', timezone: 'America/Sao_Paulo' },
    orders: {
      total: 2,
      byStatus: { pending: 1, confirmed: 0, preparing: 0, ready_for_pickup: 0, ready_for_delivery: 0, out_for_delivery: 0, completed: 1, cancelled: 0, draft: 0 },
      cancelled: 0,
      cancellationRate: 0,
    },
    completedSales: { orderCount: 1, grossOrderTotal: 30, averageTicket: 30 },
  };
  const operationalService = { getSnapshot: jest.fn().mockResolvedValue(snapshot) };
  const permissionsByProfile: Record<TestProfile, string[]> = {
    'dashboard-only': ['dashboard.view'],
    'reports-only': ['reports.read'],
    none: [],
  };
  const rbac = {
    getUserPermissions: jest.fn((userId: TestProfile) => Promise.resolve(permissionsByProfile[userId])),
    getUserRoles: jest.fn(() => Promise.resolve([])),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DashboardOperationalController],
      providers: [
        TenantAuthGuard,
        PermissionsGuard,
        { provide: DashboardOperationalService, useValue: operationalService },
        { provide: RbacService, useValue: rbac },
      ],
    })
      .overrideGuard(TenantAuthGuard)
      .useValue(new HeaderTenantAuthGuard())
      .compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
  });

  afterAll(async () => app.close());

  beforeEach(() => jest.clearAllMocks());

  async function get(profile?: TestProfile, query = '') {
    return fetch(`${await app.getUrl()}/dashboard/operational${query}`, {
      headers: profile ? { 'x-test-profile': profile } : {},
    });
  }

  it('allows dashboard.view without reports.read or the reports feature and returns only the safe DTO', async () => {
    const response = await get('dashboard-only');

    expect(response.status).toBe(HttpStatus.OK);
    const body = await response.json() as typeof snapshot;
    expect(body).toEqual(snapshot);
    expect(hasSensitiveKey(body)).toBe(false);
    expect(operationalService.getSnapshot).toHaveBeenCalledWith('tenant-a', {});
  });

  it.each<TestProfile>(['reports-only', 'none'])('denies %s without dashboard.view', async (profile) => {
    const response = await get(profile);

    expect(response.status).toBe(HttpStatus.FORBIDDEN);
    expect(operationalService.getSnapshot).not.toHaveBeenCalled();
  });

  it('returns 401 before permissions when tenant authentication is absent', async () => {
    const response = await get();

    expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    expect(operationalService.getSnapshot).not.toHaveBeenCalled();
  });

  it('does not accept a tenant selector in the query string', async () => {
    const response = await get('dashboard-only', '?tenantId=tenant-b');

    expect(response.status).toBe(HttpStatus.BAD_REQUEST);
    expect(operationalService.getSnapshot).not.toHaveBeenCalled();
  });

  it('declares dashboard.view as the only permission on the new route', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, DashboardOperationalController.prototype.getOperationalDashboard)).toEqual(['dashboard.view']);
    expect(Reflect.getMetadata('required_feature', DashboardOperationalController)).toBeUndefined();
  });
});
