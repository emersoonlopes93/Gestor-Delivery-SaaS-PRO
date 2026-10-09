import { PaymentMethod as PrismaPaymentMethod } from '@prisma/client';
import { CashMovementType } from '@gestor/types';
import { CashService } from './cash.service';

describe('CashService physical cash refunds', () => {
  type Movement = {
    tenantId: string;
    cashSessionId: string;
    type: CashMovementType;
    amount: number;
    paymentMethod?: PrismaPaymentMethod | null;
    orderId?: string | null;
    description?: string;
    createdAt?: Date;
  };

  const createRefundHarness = (input: {
    sessionStatus: 'open' | 'closed';
    closingAmountDeclared?: number | null;
    closingAmountCalculated?: number | null;
    movements: Movement[];
  }) => {
    const session = {
      id: 'session-a',
      tenantId: 'tenant-a',
      operatorId: 'operator-a',
      status: input.sessionStatus,
      openingAmount: 20,
      openedAt: new Date('2026-09-09T10:00:00.000Z'),
      closedAt: null as Date | null,
      notes: null as string | null,
      closingAmountDeclared: input.closingAmountDeclared ?? null,
      closingAmountCalculated: input.closingAmountCalculated ?? null,
      closingDifference: input.closingAmountDeclared !== null && input.closingAmountCalculated !== null
        ? (input.closingAmountDeclared ?? 0) - (input.closingAmountCalculated ?? 0)
        : null,
    };
    const movements = input.movements.map((movement) => ({
      ...movement,
      createdAt: movement.createdAt ?? new Date('2026-09-09T10:00:00.000Z'),
    }));
    const cashSession = {
      findFirst: jest.fn().mockResolvedValue(session),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(session, data);
        return { ...session, operator: { name: 'Operador' }, movements };
      }),
    };
    const cashMovement = {
      findFirst: jest.fn(async ({ where }: { where: Partial<Movement> }) => movements.find((movement) =>
        Object.entries(where).every(([key, value]) => movement[key as keyof Movement] === value),
      ) ?? null),
      create: jest.fn(async ({ data }: { data: Movement }) => {
        const created = { ...data, createdAt: new Date() };
        movements.push(created);
        return created;
      }),
      findMany: jest.fn(async () => movements),
    };
    const transactionClient = {
      cashSession,
      cashMovement,
      $executeRaw: jest.fn(),
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (tx: typeof transactionClient) => Promise<void>) => callback(transactionClient)),
      cashSession,
      cashMovement,
    };

    return {
      service: new CashService(prisma as never),
      prisma,
      session,
      movements,
      cashSession,
      cashMovement,
      transactionClient,
    };
  };

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
    const harness = createRefundHarness({
      sessionStatus: 'open',
      movements: [],
    });

    await harness.service.registerRefundMovement('tenant-a', 'session-a', 'order-a', 25, 'cash');
    await harness.service.registerRefundMovement('tenant-a', 'session-a', 'order-a', 25, 'cash');

    expect(harness.cashMovement.create).toHaveBeenCalledTimes(1);
    expect(harness.cashMovement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ paymentMethod: PrismaPaymentMethod.cash }),
    }));
  });

  it('updates a closed session snapshot from its ledger for a late cash refund', async () => {
    const harness = createRefundHarness({
      sessionStatus: 'open',
      movements: [
        { tenantId: 'tenant-a', cashSessionId: 'session-a', type: CashMovementType.opening, amount: 20 },
        { tenantId: 'tenant-a', cashSessionId: 'session-a', type: CashMovementType.sale, amount: 50, paymentMethod: PrismaPaymentMethod.cash, orderId: 'order-a' },
      ],
    });

    await harness.service.closeSession('tenant-a', 'session-a', 'operator-a', 70);
    await harness.service.registerRefundMovement('tenant-a', 'session-a', 'order-a', 50, 'cash');

    expect(harness.cashSession.update).toHaveBeenLastCalledWith({
      where: { id: 'session-a' },
      data: { closingAmountCalculated: 20, closingDifference: 50 },
    });
    expect(harness.session.closingAmountDeclared).toBe(70);
    expect(harness.transactionClient.$executeRaw).toHaveBeenCalledTimes(3);
  });

  it('does not mutate a closed session snapshot for a non-cash refund', async () => {
    const harness = createRefundHarness({
      sessionStatus: 'closed',
      closingAmountDeclared: 20,
      closingAmountCalculated: 20,
      movements: [
        { tenantId: 'tenant-a', cashSessionId: 'session-a', type: CashMovementType.opening, amount: 20 },
        { tenantId: 'tenant-a', cashSessionId: 'session-a', type: CashMovementType.sale, amount: 50, paymentMethod: PrismaPaymentMethod.pix, orderId: 'order-a' },
        { tenantId: 'tenant-a', cashSessionId: 'session-a', type: CashMovementType.closing, amount: 20 },
      ],
    });

    await harness.service.registerRefundMovement('tenant-a', 'session-a', 'order-a', 50, 'pix');

    expect(harness.cashSession.update).not.toHaveBeenCalled();
    expect(harness.session.closingAmountCalculated).toBe(20);
  });

  it('keeps an open session derived and updates no closing snapshot for cash or non-cash refunds', async () => {
    const cashHarness = createRefundHarness({
      sessionStatus: 'open',
      movements: [
        { tenantId: 'tenant-a', cashSessionId: 'session-a', type: CashMovementType.opening, amount: 20 },
        { tenantId: 'tenant-a', cashSessionId: 'session-a', type: CashMovementType.sale, amount: 50, paymentMethod: PrismaPaymentMethod.cash, orderId: 'cash-order' },
      ],
    });
    const nonCashHarness = createRefundHarness({
      sessionStatus: 'open',
      movements: [
        { tenantId: 'tenant-a', cashSessionId: 'session-a', type: CashMovementType.opening, amount: 20 },
        { tenantId: 'tenant-a', cashSessionId: 'session-a', type: CashMovementType.sale, amount: 50, paymentMethod: PrismaPaymentMethod.credit_card, orderId: 'card-order' },
      ],
    });

    await cashHarness.service.registerRefundMovement('tenant-a', 'session-a', 'cash-order', 50, 'cash');
    await nonCashHarness.service.registerRefundMovement('tenant-a', 'session-a', 'card-order', 50, 'credit_card');

    expect(cashHarness.cashSession.update).not.toHaveBeenCalled();
    expect(nonCashHarness.cashSession.update).not.toHaveBeenCalled();
    expect(expectedCash(cashHarness.movements)).toBe(20);
    expect(expectedCash(nonCashHarness.movements)).toBe(20);
  });

  it('keeps a late refund on the original closed session when another session is open', async () => {
    const currentSessionId = 'session-b';
    const harness = createRefundHarness({
      sessionStatus: 'closed',
      closingAmountDeclared: 70,
      closingAmountCalculated: 70,
      movements: [
        { tenantId: 'tenant-a', cashSessionId: 'session-a', type: CashMovementType.opening, amount: 20 },
        { tenantId: 'tenant-a', cashSessionId: 'session-a', type: CashMovementType.sale, amount: 50, paymentMethod: PrismaPaymentMethod.cash, orderId: 'order-a' },
      ],
    });

    await harness.service.registerRefundMovement('tenant-a', 'session-a', 'order-a', 50, 'cash');

    expect(harness.cashSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'session-a', tenantId: 'tenant-a' },
    }));
    expect(harness.cashSession.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'session-a' },
    }));
    expect(harness.cashSession.update).not.toHaveBeenCalledWith(expect.objectContaining({
      where: { id: currentSessionId },
    }));
  });

  it('takes a transaction-scoped lock before checking for duplicate refunds', async () => {
    const harness = createRefundHarness({
      sessionStatus: 'open',
      movements: [],
    });

    await harness.service.registerRefundMovement('tenant-a', 'session-a', 'order-a', 25, 'cash');

    expect(harness.transactionClient.$executeRaw).toHaveBeenCalledTimes(2);
    expect(harness.transactionClient.$executeRaw.mock.invocationCallOrder[0])
      .toBeLessThan(harness.cashMovement.findFirst.mock.invocationCallOrder[0]);
  });

  it('applies a concurrent duplicate refund only once under the transaction lock', async () => {
    const harness = createRefundHarness({
      sessionStatus: 'open',
      movements: [],
    });
    let tail = Promise.resolve();
    harness.prisma.$transaction.mockImplementation((callback) => {
      const next = tail.then(() => callback(harness.transactionClient));
      tail = next.then(() => undefined, () => undefined);
      return next;
    });

    await Promise.all([
      harness.service.registerRefundMovement('tenant-a', 'session-a', 'order-a', 25, 'cash'),
      harness.service.registerRefundMovement('tenant-a', 'session-a', 'order-a', 25, 'cash'),
    ]);

    expect(harness.transactionClient.$executeRaw).toHaveBeenCalledTimes(4);
    expect(harness.cashMovement.create).toHaveBeenCalledTimes(1);
  });
});
