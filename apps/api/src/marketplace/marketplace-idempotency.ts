import { MarketplaceProvider } from '@prisma/client';

export function buildMarketplaceOrderIdempotencyKey(
  connectionId: string,
  externalOrderId: string,
  provider: MarketplaceProvider = MarketplaceProvider.IFOOD,
): string {
  return `marketplace:${provider.toLowerCase()}:${connectionId}:${externalOrderId}`;
}
