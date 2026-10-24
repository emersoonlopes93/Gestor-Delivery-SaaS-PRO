import { Prisma } from '@prisma/client';
import { runSerializableTransactionWithRetry } from './serializable-transaction';

describe('runSerializableTransactionWithRetry', () => {
  const conflict = () => new Prisma.PrismaClientKnownRequestError('serialization conflict', {
    code: 'P2034',
    clientVersion: '5.22.0',
  });

  const makeRunner = (...results: Array<'success' | Error>) => ({
    $transaction: jest.fn(async (operation: (tx: object) => Promise<string>) => {
      const result = results.shift();
      if (result instanceof Error) throw result;
      return operation({});
    }),
  });

  it('repeats the complete operation after P2034 and succeeds on the second attempt', async () => {
    const runner = makeRunner(conflict(), 'success');
    const operation = jest.fn().mockResolvedValue('committed');

    await expect(runSerializableTransactionWithRetry(
      runner as never,
      operation,
      { baseBackoffMs: 0 },
    )).resolves.toBe('committed');

    expect(runner.$transaction).toHaveBeenCalledTimes(2);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('re-executes every transactional effect when the operation itself raises P2034', async () => {
    const runner = makeRunner('success', 'success');
    const effects: string[] = [];
    const operation = jest.fn()
      .mockImplementationOnce(async () => {
        effects.push('order', 'cash', 'stock');
        throw conflict();
      })
      .mockImplementationOnce(async () => {
        effects.push('order', 'cash', 'stock');
        return 'committed';
      });

    await runSerializableTransactionWithRetry(runner as never, operation, { baseBackoffMs: 0 });

    expect(operation).toHaveBeenCalledTimes(2);
    expect(effects).toEqual(['order', 'cash', 'stock', 'order', 'cash', 'stock']);
  });

  it('preserves the final P2034 after exactly three attempts', async () => {
    const finalError = conflict();
    const runner = makeRunner(conflict(), conflict(), finalError);
    const operation = jest.fn();

    await expect(runSerializableTransactionWithRetry(
      runner as never,
      operation,
      { baseBackoffMs: 0 },
    )).rejects.toBe(finalError);

    expect(runner.$transaction).toHaveBeenCalledTimes(3);
    expect(operation).not.toHaveBeenCalled();
  });

  it('does not retry a non-P2034 error', async () => {
    const error = new Error('validation failed');
    const runner = makeRunner(error);

    await expect(runSerializableTransactionWithRetry(
      runner as never,
      jest.fn(),
      { baseBackoffMs: 0 },
    )).rejects.toBe(error);

    expect(runner.$transaction).toHaveBeenCalledTimes(1);
  });

  it('retries an explicitly opted-in conflict and re-executes the transaction', async () => {
    const aggregateIdConflict = new Prisma.PrismaClientKnownRequestError('aggregate id conflict', {
      code: 'P2002',
      clientVersion: '5.22.0',
      meta: { target: ['id'] },
    });
    const runner = makeRunner(aggregateIdConflict, 'success');
    const operation = jest.fn().mockResolvedValue('committed');

    await expect(runSerializableTransactionWithRetry(
      runner as never,
      operation,
      {
        baseBackoffMs: 0,
        isAdditionalRetryableError: (error) => (
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
        ),
      },
    )).resolves.toBe('committed');

    expect(runner.$transaction).toHaveBeenCalledTimes(2);
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
