import { AdminTenantsService } from './admin-tenants.service';

describe('Admin tenant financial secret responses', () => {
  const tenant = {
    id: 'tenant-a',
    settings: {
      mercadoPagoAccessToken: 'known-access-token',
      mercadoPagoWebhookSecret: 'known-webhook-secret',
      mercadoPagoPublicKey: 'public-key',
    },
    billingSubscriptions: [],
  };
  const prisma = {
    tenant: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  const billingResolver = { getTenantBillingState: jest.fn() };
  const service = new AdminTenantsService(prisma as never, billingResolver as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redacts credentials from the admin tenant list', async () => {
    prisma.tenant.findMany.mockResolvedValue([tenant]);
    prisma.tenant.count.mockResolvedValue(1);

    const result = await service.findAll();

    expect(JSON.stringify(result)).not.toContain('known-access-token');
    expect(JSON.stringify(result)).not.toContain('known-webhook-secret');
    expect(result.items[0].settings).toEqual({ mercadoPagoPublicKey: 'public-key' });
  });

  it('redacts credentials from the admin tenant detail', async () => {
    prisma.tenant.findUnique.mockResolvedValue(tenant);
    billingResolver.getTenantBillingState.mockResolvedValue({ status: 'active' });

    const result = await service.findById('tenant-a');

    expect(JSON.stringify(result)).not.toContain('known-access-token');
    expect(JSON.stringify(result)).not.toContain('known-webhook-secret');
    expect(result?.settings).toEqual({ mercadoPagoPublicKey: 'public-key' });
  });
});
