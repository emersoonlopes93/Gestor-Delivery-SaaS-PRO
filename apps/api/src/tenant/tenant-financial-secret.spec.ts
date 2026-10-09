import { TenantService } from './tenant.service';

describe('Tenant financial secret responses', () => {
  const settings = {
    id: 'settings-a',
    tenantId: 'tenant-a',
    paymentMethods: ['pix'],
    mercadoPagoAccessToken: 'known-access-token',
    mercadoPagoWebhookSecret: 'known-webhook-secret',
    mercadoPagoPublicKey: 'public-key',
  };
  const prisma = {
    tenant: { findUnique: jest.fn() },
    tenantSettings: { upsert: jest.fn() },
  };
  const cache = { del: jest.fn() };
  const service = new TenantService(prisma as never, cache as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('removes financial credentials from GET /tenant/me service response', async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-a',
      slug: 'tenant-a',
      settings,
      operatingHours: [],
      businessGroup: null,
    });

    const result = await service.findById('tenant-a');
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('known-access-token');
    expect(serialized).not.toContain('known-webhook-secret');
    expect(result.settings).toEqual(expect.objectContaining({ mercadoPagoPublicKey: 'public-key' }));
    expect(result.settings).not.toHaveProperty('mercadoPagoAccessToken');
    expect(result.settings).not.toHaveProperty('mercadoPagoWebhookSecret');
  });

  it('removes legacy credentials from PATCH /tenant/settings service response', async () => {
    prisma.tenantSettings.upsert.mockResolvedValue(settings);
    prisma.tenant.findUnique.mockResolvedValue({ slug: 'tenant-a' });

    const result = await service.updateSettings('tenant-a', { paymentMethods: ['pix'] });
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('known-access-token');
    expect(serialized).not.toContain('known-webhook-secret');
    expect(result).not.toHaveProperty('mercadoPagoAccessToken');
    expect(result).not.toHaveProperty('mercadoPagoWebhookSecret');
  });
});
