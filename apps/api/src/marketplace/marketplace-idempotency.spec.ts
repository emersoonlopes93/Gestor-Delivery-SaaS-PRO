import { buildMarketplaceOrderIdempotencyKey } from './marketplace-idempotency';

describe('marketplace order idempotency', () => {
  it('is stable for retries of the same connection and order', () => {
    expect(buildMarketplaceOrderIdempotencyKey('connection-a', 'order-1'))
      .toBe(buildMarketplaceOrderIdempotencyKey('connection-a', 'order-1'));
  });

  it('does not collide when merchants reuse the same external order id', () => {
    expect(buildMarketplaceOrderIdempotencyKey('connection-a', 'order-1'))
      .not.toBe(buildMarketplaceOrderIdempotencyKey('connection-b', 'order-1'));
  });
});
