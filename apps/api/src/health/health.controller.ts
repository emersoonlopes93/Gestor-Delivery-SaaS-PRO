import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Public } from '../common/decorators';
import { TenantHealthService } from './tenant-health.service';
import { AdminAuthGuard } from '../admin/auth/admin-auth.guard';
import { connect as connectTcp } from 'node:net';
import { connect as connectTls } from 'node:tls';
import type { Socket } from 'node:net';

type QueueHealth = {
  name: string;
  critical: boolean;
  status: 'ok' | 'degraded' | 'disabled';
  waiting: number | null;
  active: number | null;
  failed: number | null;
  delayed: number | null;
  lastError: string | null;
};

function getRedisReadinessReason(redisEnvEnabled: boolean, redisConnected: boolean): string | null {
  const host = process.env.REDIS_HOST;
  if (!redisEnvEnabled) return 'REDIS_ENABLED=false';
  if (!host) return 'REDIS_HOST missing';
  if (host === 'localhost' || host === '127.0.0.1') return 'REDIS_HOST points to localhost';
  if (!redisConnected) return 'Redis enabled but unavailable';
  return null;
}

function getBullmqReadinessReason(bullmqEnvEnabled: boolean, redisConnected: boolean): string | null {
  if (!bullmqEnvEnabled) return 'BULLMQ_ENABLED=false';
  if (!redisConnected) return 'BullMQ waiting for healthy Redis';
  return null;
}

type RedisPingCache = {
  checkedAt: number;
  connected: boolean;
  latencyMs: number | null;
  reason: string | null;
};

const REDIS_HEALTH_CACHE_TTL_MS = Number(process.env.REDIS_HEALTH_CACHE_TTL_MS ?? 30000);
let redisPingCache: RedisPingCache | null = null;

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

async function pingRedisFromEnv(): Promise<RedisPingCache> {
  const now = Date.now();
  if (redisPingCache && now - redisPingCache.checkedAt < REDIS_HEALTH_CACHE_TTL_MS) {
    return redisPingCache;
  }

  const startedAt = Date.now();
  const host = process.env.REDIS_HOST;
  const port = Number(process.env.REDIS_PORT || 6379);
  const timeoutMs = Number(process.env.REDIS_HEALTH_TIMEOUT_MS ?? 1500);

  if (!host) {
    redisPingCache = { checkedAt: now, connected: false, latencyMs: null, reason: 'REDIS_HOST missing' };
    return redisPingCache;
  }

  const socket = process.env.REDIS_TLS === 'true'
    ? connectTls({ host, port, servername: host, rejectUnauthorized: process.env.REDIS_TLS_REJECT_UNAUTHORIZED === 'false' ? false : undefined })
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
      socket.once(process.env.REDIS_TLS === 'true' ? 'secureConnect' : 'connect', onConnect);
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
    redisPingCache = {
      checkedAt: now,
      connected,
      latencyMs: connected ? Date.now() - startedAt : null,
      reason: connected ? null : 'redis_ping_failed',
    };
    return redisPingCache;
  } catch (error) {
    redisPingCache = {
      checkedAt: now,
      connected: false,
      latencyMs: null,
      reason: error instanceof Error ? error.message : 'redis_health_unknown_error',
    };
    return redisPingCache;
  } finally {
    socket.destroy();
  }
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantHealthService: TenantHealthService,
  ) {}

  @Public()
  @Get()
  async check() {
    const startedAt = Date.now();

    const dbStartedAt = Date.now();
    const dbHealthy = await this.prisma.isHealthy();
    const dbLatencyMs = Date.now() - dbStartedAt;

    const totalLatencyMs = Date.now() - startedAt;

    const mem = process.memoryUsage();
    // Redis / Cache diagnostics (do not expose secrets)
    const redisEnvEnabled = process.env.REDIS_ENABLED !== 'false';
    let cacheDriver: 'redis' | 'memory' = 'memory';
    let redisConnected = false;
    let redisLatencyMs: number | null = null;

    if (!redisEnvEnabled) {
      cacheDriver = 'memory';
    } else {
      const redisPing = await pingRedisFromEnv();
      redisConnected = redisPing.connected;
      redisLatencyMs = redisPing.latencyMs;
      cacheDriver = redisPing.connected ? 'redis' : 'memory';
    }

    // BullMQ / Campaigns flags depend on env + redis connectivity
    const bullmqEnvEnabled = process.env.BULLMQ_ENABLED === 'true';
    const bullmqEnabled = bullmqEnvEnabled && redisEnvEnabled;
    const campaignsEnabled = process.env.CAMPAIGNS_DISPATCH_ENABLED === 'true' && redisEnvEnabled;
    const bullmqConnected = bullmqEnabled && redisConnected;
    const queues: QueueHealth[] = [
      {
        name: 'campaign-dispatch',
        critical: false,
        status: campaignsEnabled ? (bullmqConnected ? 'ok' : 'degraded') : 'disabled',
        waiting: null,
        active: null,
        failed: null,
        delayed: null,
        lastError: campaignsEnabled && !bullmqConnected ? 'queue registered but BullMQ/Redis is not healthy' : null,
      },
    ];
    const readinessReasons = [
      !dbHealthy ? 'Database health check failed' : null,
      getRedisReadinessReason(redisEnvEnabled, redisConnected),
      getBullmqReadinessReason(bullmqEnvEnabled, redisConnected),
      process.env.NODE_ENV === 'production' && process.env.REDIS_HOST && ['localhost', '127.0.0.1'].includes(process.env.REDIS_HOST)
        ? 'Production Redis cannot point to localhost'
        : null,
      process.env.NODE_ENV === 'production' && !bullmqEnvEnabled ? 'Production requires BULLMQ_ENABLED=true' : null,
    ].filter((reason): reason is string => Boolean(reason));
    const productionReady = dbHealthy && redisConnected && bullmqEnvEnabled && bullmqConnected && readinessReasons.length === 0;

    return {
      status: dbHealthy && redisConnected ? 'ok' : 'degraded',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      latencyMs: totalLatencyMs,
      memory: {
        rss: mem.rss,
        heapTotal: mem.heapTotal,
        heapUsed: mem.heapUsed,
      },
      services: {
        database: dbHealthy ? 'ok' : 'error',
        redis: redisConnected ? 'ok' : redisEnvEnabled ? 'degraded' : 'disabled',
        bullmq: bullmqEnabled ? (bullmqConnected ? 'ok' : 'degraded') : 'disabled',
        campaignsDispatch: campaignsEnabled ? (bullmqConnected ? 'ok' : 'degraded') : 'disabled',
      },
      checks: {
        database: {
          ok: dbHealthy,
          latencyMs: dbLatencyMs,
        },
        redis: {
          enabled: redisEnvEnabled,
          connected: redisConnected,
          latencyMs: redisLatencyMs,
        },
        bullmq: {
          enabled: bullmqEnvEnabled,
          connected: bullmqConnected,
          registeredQueues: queues.map((queue) => queue.name),
        },
        campaignsDispatch: {
          enabled: campaignsEnabled,
          connected: bullmqConnected,
        },
        cache: {
          driver: cacheDriver,
        },
      },
      queues,
      productionReady,
      productionReadiness: {
        productionReady,
        reasons: readinessReasons,
      },
    };
  }

  @UseGuards(AdminAuthGuard)
  @Get('tenants')
  async listTenantsHealth() {
    return this.tenantHealthService.listAllTenantsHealth();
  }

  @UseGuards(AdminAuthGuard)
  @Get('tenants/:id')
  async getTenantHealth(@Param('id') id: string) {
    return this.tenantHealthService.getTenantHealth(id);
  }
}
