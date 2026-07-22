import { Prisma, PrismaClient } from '@prisma/client';

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_BACKOFF_MS = 10;
const DEFAULT_MAX_BACKOFF_MS = 50;

type TransactionRunner = Pick<PrismaClient, '$transaction'>;

export type SerializableTransactionRetryOptions = {
  maxAttempts?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  maxWait?: number;
  timeout?: number;
  onRetry?: (attempt: number, delayMs: number) => void;
};

const wait = (delayMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delayMs));

export function isSerializableTransactionConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

export async function runSerializableTransactionWithRetry<T>(
  prisma: TransactionRunner,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
  options: SerializableTransactionRetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseBackoffMs = options.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS;
  const maxBackoffMs = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: options.maxWait,
        timeout: options.timeout,
      });
    } catch (error) {
      if (!isSerializableTransactionConflict(error) || attempt === maxAttempts) {
        throw error;
      }

      const delayMs = Math.min(baseBackoffMs * (2 ** (attempt - 1)), maxBackoffMs);
      options.onRetry?.(attempt, delayMs);
      await wait(delayMs);
    }
  }

  throw new Error('Unreachable serializable transaction retry state');
}
