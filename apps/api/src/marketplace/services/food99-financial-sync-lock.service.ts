import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Optional } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { MARKETPLACE_EVENT_QUEUE } from '../marketplace.constants';

const LOCK_TTL_MS = 15 * 60_000;
const RELEASE_IF_OWNER = `
  if redis.call('get', KEYS[1]) == ARGV[1] then
    return redis.call('del', KEYS[1])
  end
  return 0
`;

/**
 * Redis-backed exclusion shared by the manual endpoint and BullMQ workers.
 * The lease is deliberately finite so a stopped process cannot strand a connection.
 */
@Injectable()
export class Food99FinancialSyncLockService {
  constructor(
    @Optional() @InjectQueue(MARKETPLACE_EVENT_QUEUE) private readonly queue?: Queue,
  ) {}

  async tryRun<T>(
    tenantId: string,
    connectionId: string,
    action: () => Promise<T>,
  ): Promise<{ acquired: boolean; value?: T }> {
    if (!this.queue) return { acquired: true, value: await action() };

    const client = await this.queue.client;
    const key = `marketplace:food99:financial-sync:${tenantId}:${connectionId}`;
    const token = randomUUID();
    const acquired = await client.set(key, token, 'PX', LOCK_TTL_MS, 'NX');
    if (acquired !== 'OK') return { acquired: false };

    try {
      return { acquired: true, value: await action() };
    } finally {
      await client.eval(RELEASE_IF_OWNER, 1, key, token);
    }
  }
}
