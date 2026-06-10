import { Controller, Get, Param, UseGuards, Inject } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Public } from '../common/decorators';
import { TenantHealthService } from './tenant-health.service';
import { AdminAuthGuard } from '../admin/auth/admin-auth.guard';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

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

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantHealthService: TenantHealthService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
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

    try {
      if (!redisEnvEnabled) {
        cacheDriver = 'memory';
      } else {
        const cmObj: unknown = this.cacheManager;
        let store: unknown = undefined;
        if (cmObj && typeof cmObj === 'object' && 'store' in cmObj) {
          store = (cmObj as { store?: unknown }).store;
        }

        if (store && typeof store === 'object') {
          const s = store as { client?: unknown; getClient?: unknown };
          const client = s.client ?? (typeof s.getClient === 'function' ? (s.getClient as () => unknown)() : undefined);
          if (client && typeof (client as { ping?: unknown }).ping === 'function') {
            cacheDriver = 'redis';
            const pingStart = Date.now();
            const pingResult = await Promise.race([
              (client as { ping: () => Promise<unknown> }).ping(),
              new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
            ]);
            if (typeof pingResult === 'string') {
              redisConnected = true;
              redisLatencyMs = Date.now() - pingStart;
            }
          } else {
            cacheDriver = 'memory';
          }
        } else {
          cacheDriver = 'memory';
        }
      }
    } catch {
      cacheDriver = 'memory';
      redisConnected = false;
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
