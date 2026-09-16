import { MarketplaceProvider } from '@prisma/client';
import { MarketplaceCatalogMappingService } from './marketplace-catalog-mapping.service';

describe('MarketplaceCatalogMappingService', () => {
  function setup() {
    const prisma = {
      marketplaceConnection: { findFirst: jest.fn() },
      product: { findFirst: jest.fn() },
      marketplaceCatalogMapping: { upsert: jest.fn(), findMany: jest.fn() },
      marketplaceOrder: { findMany: jest.fn() },
    };
    return { prisma, service: new MarketplaceCatalogMappingService(prisma as never) };
  }

  it('scopes an upsert to the tenant-owned connection and canonical product', async () => {
    const { prisma, service } = setup();
    prisma.marketplaceConnection.findFirst.mockResolvedValue({ id: 'conn-a', provider: MarketplaceProvider.FOOD_99 });
    prisma.product.findFirst.mockResolvedValue({ id: 'product-a' });
    prisma.marketplaceCatalogMapping.upsert.mockResolvedValue({ id: 'mapping-a' });

    await service.upsert('tenant-a', {
      connectionId: 'conn-a', externalItemId: 'app-item-a', externalItemName: 'Pizza externa', productId: 'product-a',
    });

    expect(prisma.marketplaceConnection.findFirst).toHaveBeenCalledWith({
      where: { id: 'conn-a', tenantId: 'tenant-a' }, select: { id: true, provider: true },
    });
    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: { id: 'product-a', tenantId: 'tenant-a', deletedAt: null }, select: { id: true },
    });
    expect(prisma.marketplaceCatalogMapping.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { connectionId_provider_externalItemId: { connectionId: 'conn-a', provider: MarketplaceProvider.FOOD_99, externalItemId: 'app-item-a' } },
      create: expect.objectContaining({ tenantId: 'tenant-a', productId: 'product-a' }),
    }));
  });

  it('resolves only active mappings for the exact tenant, provider and connection', async () => {
    const { prisma, service } = setup();
    prisma.marketplaceCatalogMapping.findMany.mockResolvedValue([{ externalItemId: 'app-item-a', productId: 'product-a' }]);

    await expect(service.resolveProducts('tenant-a', 'conn-a', MarketplaceProvider.FOOD_99, ['app-item-a'])).resolves.toEqual(
      new Map([['app-item-a', 'product-a']]),
    );
    expect(prisma.marketplaceCatalogMapping.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-a', connectionId: 'conn-a', provider: MarketplaceProvider.FOOD_99 }),
    }));
  });

  it('lists unmapped identities only for the requesting tenant and exact connection identity', async () => {
    const { prisma, service } = setup();
    prisma.marketplaceOrder.findMany.mockResolvedValue([{
      connectionId: 'conn-a', provider: MarketplaceProvider.FOOD_99,
      normalizedPayload: { items: [{ externalItemId: 'app-item-a', name: 'Pizza externa' }] },
      connection: { displayName: 'Loja 99', externalStoreId: 'store-a' },
    }]);
    prisma.marketplaceCatalogMapping.findMany.mockResolvedValue([]);

    await expect(service.listUnmappedItems('tenant-a')).resolves.toEqual([expect.objectContaining({
      connectionId: 'conn-a', provider: MarketplaceProvider.FOOD_99, externalItemId: 'app-item-a', externalItemName: 'Pizza externa',
    })]);
    expect(prisma.marketplaceOrder.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'tenant-a' } }));
  });
});
