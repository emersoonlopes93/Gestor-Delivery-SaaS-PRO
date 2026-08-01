import 'reflect-metadata';
import { PaymentMethod, type CreateOrderDTO } from '@gestor/types';
import {
  CheckoutSubmitGuard,
  createCheckoutIdempotencyKey,
  isAmbiguousCheckoutError,
} from './checkout-submission';

function createPayload(overrides: Partial<CreateOrderDTO> = {}): CreateOrderDTO {
  return {
    idempotencyKey: '',
    customerName: 'Cliente',
    customerPhone: '11999999999',
    fulfillmentType: 'pickup',
    items: [{ lineType: 'product', productId: 'product-1', quantity: 1 }],
    payment: { method: PaymentMethod.cash, changeFor: 0 },
    ...overrides,
  };
}

describe('checkout submission safety', () => {
  it('blocks double-click and programmatic reentry synchronously', () => {
    const guard = new CheckoutSubmitGuard();
    const postOrder = vi.fn();

    if (guard.tryStart()) postOrder();
    if (guard.tryStart()) postOrder();

    expect(postOrder).toHaveBeenCalledTimes(1);
  });

  it('keeps a completed checkout closed to further submissions', () => {
    const guard = new CheckoutSubmitGuard();
    expect(guard.tryStart()).toBe(true);

    guard.succeed();

    expect(guard.tryStart()).toBe(false);
  });

  it('releases a failed checkout for retry', () => {
    const guard = new CheckoutSubmitGuard();
    expect(guard.tryStart()).toBe(true);

    guard.fail();

    expect(guard.tryStart()).toBe(true);
  });

  it('keeps the key for the same logical payload and changes it for a new payload', async () => {
    const attemptId = '00000000-0000-4000-8000-000000000001';
    const first = await createCheckoutIdempotencyKey(attemptId, createPayload());
    const retry = await createCheckoutIdempotencyKey(attemptId, createPayload());
    const changed = await createCheckoutIdempotencyKey(
      attemptId,
      createPayload({ notes: 'Sem cebola' }),
    );
    const newOrder = await createCheckoutIdempotencyKey(
      '00000000-0000-4000-8000-000000000002',
      createPayload(),
    );

    expect(retry).toBe(first);
    expect(changed).not.toBe(first);
    expect(newOrder).not.toBe(first);
    expect(first.length).toBeLessThanOrEqual(100);
  });

  it('distinguishes ambiguous network failures from definitive HTTP errors', () => {
    expect(isAmbiguousCheckoutError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isAmbiguousCheckoutError({ status: 422 })).toBe(false);
  });
});
