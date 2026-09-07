import { PaymentMethod as PrismaPaymentMethod } from '@prisma/client';
import { CashMovementType } from '@gestor/types';
import { CashService } from './cash.service';

describe('CashService physical cash refunds', () => {
  const expectedCash = (
    movements: Array<{
      type: CashMovementType;
      amount: number;
      paymentMethod?: PrismaPaymentMethod | null;
      orderId?: string | null;
    }>,
  ): number => {
    const service = new CashService({} as never);
    const calculate = Object.getPrototypeOf(service).calculateExpectedCashAmount as (
      value: typeof movements,
    ) => number;
    return calculate.call(service, movements);
  };

  it('returns physical cash to the opening amount for a cash sale and refund', () => {
    expect(expectedCash([
      { type: CashMovementType.opening, amount: 20 },
      { type: CashMovementType.sale, amount: 50, paymentMethod: PrismaPaymentMethod.cash, orderId: 'cash-order' },
      { type: CashMovementType.refund, amount: 50, paymentMethod: PrismaPaymentMethod.cash, orderId: 'cash-order' },
    ])).toBe(20);
  });

  it.each([PrismaPaymentMethod.pix, PrismaPaymentMethod.credit_card])(
    'does not reduce physical cash for a %s refund',
    (paymentMethod) => {
      expect(expectedCash([
        { type: CashMovementType.opening, amount: 20 },
        { type: CashMovementType.sale, amount: 50, paymentMethod, orderId: 'non-cash-order' },
        { type: CashMovementType.refund, amount: 50, paymentMethod, orderId: 'non-cash-order' },
      ])).toBe(20);
    },
  );

  it('uses the linked sale method for a legacy refund without paymentMethod', () => {
    expect(expectedCash([
      { type: CashMovementType.sale, amount: 30, paymentMethod: PrismaPaymentMethod.cash, orderId: 'legacy-cash' },
      { type: CashMovementType.refund, amount: 30, orderId: 'legacy-cash' },
      { type: CashMovementType.sale, amount: 40, paymentMethod: PrismaPaymentMethod.pix, orderId: 'legacy-pix' },
      { type: CashMovementType.refund, amount: 40, orderId: 'legacy-pix' },
    ])).toBe(0);
  });

  it('persists the original method and ignores a repeated refund for the same sale', async () => {
    const cashMovement = {
      findFirst: jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'refund-1' }),
      create: jest.fn(),
    };
    const transactionClient = { cashMovement };
    const prisma = {
      $transaction: jest.fn(async (callback: (tx: typeof transactionClient) => Promise<void>) => callback(transactionClient)),
    };
    const service = new CashService(prisma as never);

    await service.registerRefundMovement('tenant-a', 'session-a', 'order-a', 25, 'cash');
    await service.registerRefundMovement('tenant-a', 'session-a', 'order-a', 25, 'cash');

    expect(cashMovement.create).toHaveBeenCalledTimes(1);
    expect(cashMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ paymentMethod: PrismaPaymentMethod.cash }),
    }));
  });
});
