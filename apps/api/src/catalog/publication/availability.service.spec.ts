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
