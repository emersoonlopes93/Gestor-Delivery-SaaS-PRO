import { MarketplaceProvider, type Prisma } from '@prisma/client';

type MarketplaceOrderOwnership = {
  provider: MarketplaceProvider;
  normalizedPayload: Prisma.JsonValue | null;
};

export function allowsInternalDeliveryAssignment(
  marketplaceOrders: MarketplaceOrderOwnership[],
): boolean {
  return marketplaceOrders.every((marketplaceOrder) => {
    if (marketplaceOrder.provider !== MarketplaceProvider.FOOD_99) return true;
    const payload = asRecord(marketplaceOrder.normalizedPayload);
    return payload?.logisticsOwnership === 'merchant';
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
