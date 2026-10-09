import { MarketplaceProvider } from '@prisma/client';
import { OrdersService } from './orders.service';

type ExpectedNetResolver = (
  tenantId: string,
  marketplaceOrders: Array<{ provider: string; connectionId: string; externalOrderId: string }>,
) => Promise<number | null>;

function createService(sum: bigint | null) {
  const prisma = {
    marketplaceBillEntry: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { settlementAmount: sum } }),
    },
  };
  const service = new OrdersService(
    prisma as never,
    {} as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never, {} as never,
  );
  const resolve = (Reflect.get(service, 'getExpectedNetAmountCents') as ExpectedNetResolver).bind(service);
  return { prisma, resolve };
}

describe('OrdersService 99Food expected net amount', () => {
  const order = {
    provider: MarketplaceProvider.FOOD_99,
    connectionId: 'connection-99food',
    externalOrderId: '5764609487470920339',
  };

  it.each([
    ['one Bill Data event', 2384n, 2384],
    ['aggregated revenue and refund', 2500n, 2500],
    ['a negative adjustment aggregate', -500n, -500],
    ['a valid zero aggregate', 0n, 0],
  ])('returns %s without changing its sign', async (_label, sum, expected) => {
    const { prisma, resolve } = createService(sum);

    await expect(resolve('tenant-a', [order])).resolves.toBe(expected);
    expect(prisma.marketplaceBillEntry.aggregate).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-a',
        provider: MarketplaceProvider.FOOD_99,
        connectionId: 'connection-99food',
        orderId: '5764609487470920339',
        orderType: { not: 5 },
      },
      _sum: { settlementAmount: true },
    });
  });

  it('returns null when no Bill Data exists and does not query non-99Food orders', async () => {
    const withoutBills = createService(null);
    await expect(withoutBills.resolve('tenant-a', [order])).resolves.toBeNull();

    const otherProvider = createService(2384n);
    await expect(otherProvider.resolve('tenant-a', [{ ...order, provider: 'IFOOD' }])).resolves.toBeNull();
    expect(otherProvider.prisma.marketplaceBillEntry.aggregate).not.toHaveBeenCalled();
  });

  it('keeps the large external order ID as the exact connection-scoped lookup value', async () => {
    const { prisma, resolve } = createService(2384n);
    const externalOrderId = '9223372036854775807';

    await expect(resolve('tenant-a', [{ ...order, externalOrderId }])).resolves.toBe(2384);
    expect(prisma.marketplaceBillEntry.aggregate).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: 'tenant-a',
        connectionId: 'connection-99food',
        orderId: externalOrderId,
      }),
    }));
  });
});
