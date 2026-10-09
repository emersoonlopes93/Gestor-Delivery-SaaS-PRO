import { MarketplaceAdminOperationsService } from './marketplace-admin-operations.service';

describe('MarketplaceAdminOperationsService', () => {
  it('requests only sanitized fields for operation details', async () => {
    const prisma = {
      marketplaceOperation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'operation-1', marketplaceOrder: {}, divergences: [] }),
      },
    };
    const service = new MarketplaceAdminOperationsService(prisma as never, {} as never);
    await service.getOperation('tenant-1', 'operation-1');
    const call = prisma.marketplaceOperation.findFirst.mock.calls[0][0];
    expect(call.where).toEqual({ id: 'operation-1', tenantId: 'tenant-1' });
    expect(call.select).not.toHaveProperty('connection');
    expect(call.select.marketplaceOrder.select).not.toHaveProperty('rawPayload');
    expect(call.select.marketplaceOrder.select).not.toHaveProperty('normalizedPayload');
  });
});
