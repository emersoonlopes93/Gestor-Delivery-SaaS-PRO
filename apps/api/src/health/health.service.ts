/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { OrdersGateway } from '../orders/orders.gateway';
import { DeliveryTrackingGateway } from '../delivery/delivery-tracking.gateway';
import { ChatGateway } from '../chat/chat.gateway';
import { Queue } from 'bullmq';
import { connect as connectTcp } from 'node:net';
import { connect as connectTls } from 'node:tls';
import type { Socket } from 'node:net';

export type QueueMetrics = {
  name: string;
  status: 'ok' | 'degraded' | 'disabled';
  waiting: number | null;
  active: number | null;
  failed: number | null;
  delayed: number | null;
  error: string | null;
};

export type HealthStatus = 'ok' | 'degraded' | 'down';

type WebSocketGatewayStatus = {
  active: boolean;
  clientsCount: number | null;
  reason: 'gateway_not_initialized' | 'server_not_initialized' | 'engine_not_initialized' | null;
};

export type ReadyPayload = {
  status: HealthStatus;
  timestamp: string;
  uptime: number;
  services: {
    database: 'ok' | 'error';
    redis: 'ok' | 'degraded' | 'disabled';
    bullmq: 'ok' | 'degraded' | 'disabled';
    websocket: 'ok' | 'degraded';
  };
  details: {
    database: { ok: boolean; latencyMs: number | null };
    redis: { enabled: boolean; connected: boolean; latencyMs: number | null; reason: string | null };
    bullmq: { enabled: boolean; connected: boolean; queues: QueueMetrics[] };
    websocket: {
      ordersGateway: WebSocketGatewayStatus;
      deliveryGateway: WebSocketGatewayStatus;
      chatGateway: WebSocketGatewayStatus;
    };
  };
};

function writeRedisCommand(socket: Socket, command: string[]): void {
  const payload = `*${command.length}\r\n${command.map((item) => `$${Buffer.byteLength(item)}\r\n${item}\r\n`).join('')}`;
  socket.write(payload);
}

function readRedisResponse(socket: Socket, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('redis_health_timeout'));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off('data', onData);
      socket.off('error', onError);
    };
    const onData = (chunk: Buffer) => {
      chunks.push(chunk);
      const response = Buffer.concat(chunks).toString('utf8');
      if (response.includes('\r\n')) {
        cleanup();
        resolve(response);
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    socket.on('data', onData);
    socket.once('error', onError);
  });
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async pingRedis(): Promise<{ connected: boolean; latencyMs: number | null; reason: string | null }> {
    const host = process.env.REDIS_HOST;
    const port = Number(process.env.REDIS_PORT || 6379);
    const timeoutMs = Number(process.env.REDIS_HEALTH_TIMEOUT_MS ?? 1500);

    if (!host) {
      return { connected: false, latencyMs: null, reason: 'REDIS_HOST missing' };
    }

    const startedAt = Date.now();
    const useTls = process.env.REDIS_TLS === 'true';
    const rejectUnauthorized = process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== 'false';

    const socket = useTls
      ? connectTls({ host, port, servername: host, rejectUnauthorized })
      : connectTcp({ host, port });

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          cleanup();
          reject(new Error('redis_health_connect_timeout'));
        }, timeoutMs);
        const cleanup = () => {
          clearTimeout(timeout);
          socket.off('connect', onConnect);
          socket.off('secureConnect', onConnect);
          socket.off('error', onError);
        };
        const onConnect = () => {
          cleanup();
          resolve();
        };
        const onError = (error: Error) => {
          cleanup();
          reject(error);
        };
        socket.once(useTls ? 'secureConnect' : 'connect', onConnect);
        socket.once('error', onError);
      });

      const password = process.env.REDIS_PASSWORD;
      if (password) {
        writeRedisCommand(socket, ['AUTH', password]);
        const authResponse = await readRedisResponse(socket, timeoutMs);
        if (!authResponse.startsWith('+OK')) {
          throw new Error('redis_health_auth_failed');
        }
      }

      writeRedisCommand(socket, ['PING']);
      const pingResponse = await readRedisResponse(socket, timeoutMs);
      const connected = pingResponse.startsWith('+PONG');
      return {
        connected,
        latencyMs: connected ? Date.now() - startedAt : null,
        reason: connected ? null : 'redis_ping_failed',
      };
    } catch (error) {
      return {
        connected: false,
        latencyMs: null,
        reason: error instanceof Error ? error.message : 'redis_unknown_error',
      };
    } finally {
      socket.destroy();
    }
  }

  private getBullmqRedisConnectionOptions() {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = Number(process.env.REDIS_PORT || 6379);
    const password = process.env.REDIS_PASSWORD || undefined;
    const base = {
      host,
      port,
      password,
      connectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT_MS ?? 3000),
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    };

    return process.env.REDIS_TLS === 'true'
      ? {
          ...base,
          tls: {
            servername: host !== 'localhost' ? host : undefined,
            rejectUnauthorized: process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== 'false',
          },
        }
      : base;
  }

  async checkQueueHealth(queueName: string, enabled: boolean): Promise<QueueMetrics> {
    if (!enabled) {
      return {
        name: queueName,
        status: 'disabled',
        waiting: null,
        active: null,
        failed: null,
        delayed: null,
        error: null,
      };
    }

    let queue: Queue | null = null;
    try {
      queue = new Queue(queueName, {
        connection: this.getBullmqRedisConnectionOptions(),
      });

      const [waiting, active, failed, delayed] = await Promise.all([
        queue.getJobCounts('waiting').then((val) => val.waiting),
        queue.getJobCounts('active').then((val) => val.active),
        queue.getJobCounts('failed').then((val) => val.failed),
        queue.getJobCounts('delayed').then((val) => val.delayed),
      ]);

      return {
        name: queueName,
        status: 'ok',
        waiting,
        active,
        failed,
        delayed,
        error: null,
      };
    } catch (err) {
      return {
        name: queueName,
        status: 'degraded',
        waiting: null,
        active: null,
        failed: null,
        delayed: null,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      if (queue) {
        await queue.close().catch(() => {});
      }
    }
  }

  private getWebSocketGatewayStatus(instance: {
    server?: {
      engine?: { clientsCount?: number };
      server?: { engine?: { clientsCount?: number } };
    };
  } | null): WebSocketGatewayStatus {
    if (!instance) {
      return { active: false, clientsCount: null, reason: 'gateway_not_initialized' };
    }

    const server = instance.server;
    if (!server) {
      return { active: false, clientsCount: null, reason: 'server_not_initialized' };
    }

    const clientsCount = server.engine?.clientsCount ?? server.server?.engine?.clientsCount;
    if (typeof clientsCount !== 'number') {
      return { active: false, clientsCount: null, reason: 'engine_not_initialized' };
    }

    return { active: true, clientsCount, reason: null };
  }

  async getReadiness(): Promise<ReadyPayload> {
    const startedAt = Date.now();

    // 1. PostgreSQL Check
    let dbHealthy = false;
    let dbLatencyMs: number | null = null;
    try {
      const dbStartedAt = Date.now();
      dbHealthy = await this.prisma.isHealthy();
      dbLatencyMs = Date.now() - dbStartedAt;
    } catch (err) {
      try {
        const dbStartedAt = Date.now();
        await this.prisma.$queryRawUnsafe('SELECT 1');
        dbHealthy = true;
        dbLatencyMs = Date.now() - dbStartedAt;
      } catch {
        dbHealthy = false;
      }
    }

    // 2. Redis Check
    const redisEnabled = process.env.REDIS_ENABLED !== 'false';
    let redisConnected = false;
    let redisLatencyMs: number | null = null;
    let redisReason: string | null = null;

    if (redisEnabled) {
      const redisPing = await this.pingRedis();
      redisConnected = redisPing.connected;
      redisLatencyMs = redisPing.latencyMs;
      redisReason = redisPing.reason;
    }

    // 3. BullMQ Check
    const bullmqEnabled = redisEnabled && process.env.BULLMQ_ENABLED === 'true';
    const queueNames = ['campaign-dispatch', 'marketplace-events', 'marketplace-status'];
    const queues: QueueMetrics[] = [];

    if (bullmqEnabled && redisConnected) {
      for (const q of queueNames) {
        const qHealth = await this.checkQueueHealth(q, true);
        queues.push(qHealth);
      }
    } else {
      for (const q of queueNames) {
        queues.push({
          name: q,
          status: bullmqEnabled ? 'degraded' : 'disabled',
          waiting: null,
          active: null,
          failed: null,
          delayed: null,
          error: !redisConnected && bullmqEnabled ? 'Redis is offline' : null,
        });
      }
    }

    const bullmqConnected = bullmqEnabled && redisConnected && queues.every((q) => q.status === 'ok');

    // 4. WebSocket Check (Instâncias estáticas)
    const ordersGateway = this.getWebSocketGatewayStatus(OrdersGateway.instance);
    const deliveryGateway = this.getWebSocketGatewayStatus(DeliveryTrackingGateway.instance);
    const chatGateway = this.getWebSocketGatewayStatus(ChatGateway.instance);
    const websocketHealthy = ordersGateway.active && deliveryGateway.active && chatGateway.active;

    // Status logic
    let status: HealthStatus = 'ok';
    if (!dbHealthy) {
      status = 'down';
    } else if (!redisConnected || !bullmqConnected || !websocketHealthy) {
      status = 'degraded';
    }

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: dbHealthy ? 'ok' : 'error',
        redis: redisConnected ? 'ok' : redisEnabled ? 'degraded' : 'disabled',
        bullmq: bullmqEnabled ? (bullmqConnected ? 'ok' : 'degraded') : 'disabled',
        websocket: websocketHealthy ? 'ok' : 'degraded',
      },
      details: {
        database: {
          ok: dbHealthy,
          latencyMs: dbLatencyMs,
        },
        redis: {
          enabled: redisEnabled,
          connected: redisConnected,
          latencyMs: redisLatencyMs,
          reason: redisReason,
        },
        bullmq: {
          enabled: bullmqEnabled,
          connected: bullmqConnected,
          queues,
        },
        websocket: {
          ordersGateway,
          deliveryGateway,
          chatGateway,
        },
      },
    };
  }
}
