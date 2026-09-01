export function buildMarketplaceOrderIdempotencyKey(connectionId: string, externalOrderId: string): string {
  return `marketplace:ifood:${connectionId}:${externalOrderId}`;
}
