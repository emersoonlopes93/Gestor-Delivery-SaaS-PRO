import 'reflect-metadata';
import { PaymentMethod, type CreateOrderDTO } from '@gestor/types';
import { ConflictException } from '@nestjs/common';
import {
  assertOrderIdempotencyPayload,
  fingerprintOrderSubmission,
  isPrismaUniqueConstraintError,
} from './order-idempotency.util';

function createPayload(): CreateOrderDTO {
  return {
    idempotencyKey: '',
    customerName: 'Cliente',
    customerPhone: '11999999999',
    fulfillmentType: 'pickup',
    items: [{ lineType: 'product', productId: 'product-1', quantity: 1 }],
    payment: { method: PaymentMethod.cash, changeFor: 0 },
  };
}

describe('order idempotency contract', () => {
  it('accepts the same versioned key and material payload', () => {
    const payload = createPayload();
    payload.idempotencyKey = `v1.attempt-1.${fingerprintOrderSubmission(payload)}`;

    expect(() => assertOrderIdempotencyPayload(payload)).not.toThrow();
  });

  it('rejects the same versioned key with an incompatible payload', () => {
    const payload = createPayload();
    payload.idempotencyKey = `v1.attempt-1.${fingerprintOrderSubmission(payload)}`;
    payload.notes = 'Payload alterado';

    expect(() => assertOrderIdempotencyPayload(payload)).toThrow(ConflictException);
  });

  it('keeps legacy keys compatible and identifies Prisma uniqueness races', () => {
    const payload = createPayload();
    payload.idempotencyKey = 'legacy-checkout-key';

    expect(() => assertOrderIdempotencyPayload(payload)).not.toThrow();
    expect(isPrismaUniqueConstraintError({ code: 'P2002' })).toBe(true);
    expect(isPrismaUniqueConstraintError({ code: 'P2034' })).toBe(false);
  });
});
