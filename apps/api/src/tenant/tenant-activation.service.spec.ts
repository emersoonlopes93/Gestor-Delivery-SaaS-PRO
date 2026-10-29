import { OrderStatus } from '@prisma/client';
import { TenantActivationService } from './tenant-activation.service';

describe('TenantActivationService', () => {
  const makeService = (overrides?: { firstOrder?: { createdAt: Date; status: OrderStatus } | null; tenantId?: string }) => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          slug: 'loja-a',
          status: 'active',
          onboarding: { completedAt: new Date('2026-10-01T00:00:00.000Z') },
        }),
      },
      product: { findMany: jest.fn().mockResolvedValue([{ id: 'product-a' }]) },
      order: {
        findFirst: jest.fn()
          .mockResolvedValueOnce(overrides?.firstOrder ?? null)
          .mockResolvedValueOnce(null),
      },
    };
    const availability = {
      getStoreStatus: jest.fn().mockResolvedValue({ isOpen: true, reason: 'OPEN', message: 'Aberto agora' }),
      decideMany: jest.fn().mockResolvedValue(new Map([['product-a', { canSell: true }]])),
    };
    return { service: new TenantActivationService(prisma as never, availability as never), prisma, availability };
  };

  it('derives readiness from canonical data without writing an onboarding milestone', async () => {
    const { service, prisma } = makeService();
    const result = await service.getStatus('tenant-a');

    expect(result).toMatchObject({
      onboardingCompleted: true,
      operationallyReady: true,
      acceptingOrdersNow: true,
      sellableProductCount: 1,
      firstStorefrontOrder: null,
    });
    expect(prisma.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: 'tenant-a', sourceChannel: { in: ['direct_online', 'storefront'] } }),
    }));
  });

  it('recognizes a persisted pending storefront order as received, not completed or paid', async () => {
    const { service } = makeService({
      firstOrder: { createdAt: new Date('2026-10-02T10:00:00.000Z'), status: OrderStatus.pending },
    });
    const result = await service.getStatus('tenant-a');

    expect(result.firstStorefrontOrder).toEqual({ receivedAt: '2026-10-02T10:00:00.000Z', status: 'pending' });
    expect(result.firstCompletedStorefrontOrder).toBeNull();
  });
});
