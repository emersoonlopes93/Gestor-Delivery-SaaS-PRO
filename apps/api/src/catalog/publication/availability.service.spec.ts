import { AvailabilityService } from './availability.service';

describe('AvailabilityService category active days', () => {
  const now = new Date('2026-08-03T12:00:00.000Z'); // Monday in America/Sao_Paulo
  const makeService = (category: { isActive: boolean; activeDays: string[] }, product = { isActive: true, isAvailable: true }) => {
    const prisma = {
      product: { findMany: jest.fn().mockResolvedValue([{ id: 'product-1', ...product, category }]) },
      catalogPublication: { findMany: jest.fn().mockResolvedValue([]) },
      tenantSettings: { findUnique: jest.fn().mockResolvedValue({ timezone: 'America/Sao_Paulo' }) },
    };
    const service = new AvailabilityService(prisma as never);
    jest.spyOn(service, 'getStoreStatus').mockResolvedValue({ isOpen: true, message: 'Aberto agora', reason: 'OPEN' });
    return service;
  };

  it('treats an empty category schedule as every day', async () => {
    const decisions = await makeService({ isActive: true, activeDays: [] }).decideMany({
      tenantId: 'tenant-1', productIds: ['product-1'], channel: 'storefront_delivery', now, ignoreStoreClosed: true,
    });
    expect(decisions.get('product-1')).toMatchObject({ canSell: true, reason: null });
  });

  it('uses the tenant timezone for category active days', async () => {
    const decisions = await makeService({ isActive: true, activeDays: ['TUESDAY'] }).decideMany({
      tenantId: 'tenant-1', productIds: ['product-1'], channel: 'storefront_delivery', now, ignoreStoreClosed: true,
    });
    expect(decisions.get('product-1')).toMatchObject({ canSell: false, reason: 'CATEGORY_OUT_OF_SCHEDULE' });
  });

  it('makes category and product kill switches authoritative', async () => {
    const categoryDecision = await makeService({ isActive: false, activeDays: ['MONDAY'] }).decideMany({
      tenantId: 'tenant-1', productIds: ['product-1'], channel: 'storefront_delivery', now, ignoreStoreClosed: true,
    });
    expect(categoryDecision.get('product-1')).toMatchObject({ canSell: false, reason: 'CATEGORY_INACTIVE' });

    const productDecision = await makeService({ isActive: true, activeDays: ['MONDAY'] }, { isActive: false, isAvailable: true }).decideMany({
      tenantId: 'tenant-1', productIds: ['product-1'], channel: 'storefront_delivery', now, ignoreStoreClosed: true,
    });
    expect(productDecision.get('product-1')).toMatchObject({ canSell: false, reason: 'PRODUCT_INACTIVE' });
  });
});

describe('AvailabilityService operational channel configuration', () => {
  function createService(input: { pickupEnabled: boolean; paymentMethods: unknown; deliveryCoverage: unknown }) {
    const prisma = {
      tenantSettings: {
        findUnique: jest.fn().mockResolvedValue({
          isStorePaused: false,
          timezone: 'America/Sao_Paulo',
          street: 'Rua A',
          number: '1',
          neighborhood: 'Centro',
          zipCode: '01000-000',
          pickupEnabled: input.pickupEnabled,
          paymentMethods: input.paymentMethods,
        }),
      },
      deliveryCoverageConfig: { findUnique: jest.fn().mockResolvedValue(input.deliveryCoverage) },
      tenantOperatingHours: {
        findMany: jest.fn().mockResolvedValue([{ dayOfWeek: 1, isOpen: true, openTime: '00:00', closeTime: '23:59' }]),
      },
    };
    return new AvailabilityService(prisma as never);
  }

  it('keeps a pickup-only store with cash or card available without a Pix key', async () => {
    const status = await createService({ pickupEnabled: true, paymentMethods: ['cash', 'credit_card'], deliveryCoverage: null })
      .getStoreStatus('tenant-1', new Date('2026-08-03T12:00:00.000Z'));

    expect(status.reason).not.toBe('CONFIG_PENDING');
  });

  it('still blocks a store without an accepted payment method or fulfillment mode', async () => {
    const status = await createService({ pickupEnabled: false, paymentMethods: [], deliveryCoverage: null })
      .getStoreStatus('tenant-1', new Date('2026-08-03T12:00:00.000Z'));

    expect(status).toMatchObject({ isOpen: false, reason: 'CONFIG_PENDING' });
    expect(status.missingRequirements).toEqual(expect.arrayContaining([
      'PAYMENT_METHOD_MISSING',
      'FULFILLMENT_METHOD_MISSING',
    ]));
  });
});
