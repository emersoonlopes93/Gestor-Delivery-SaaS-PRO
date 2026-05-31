import { Controller, Get, Param, UseGuards, Inject } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Public } from '../common/decorators';
import { TenantHealthService } from './tenant-health.service';
import { AdminAuthGuard } from '../admin/auth/admin-auth.guard';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

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
          const client = s.client ?? (typeof s.getClient === 'function' ? (s.getClient as Function)() : undefined);
          if (client && typeof client.ping === 'function') {
            cacheDriver = 'redis';
            const pingStart = Date.now();
            const pingResult = await Promise.race([
              client.ping(),
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
    } catch (err) {
      cacheDriver = 'memory';
      redisConnected = false;
    }

    // BullMQ / Campaigns flags depend on env + redis connectivity
    const bullmqEnabled = process.env.BULLMQ_ENABLED === 'true' && redisEnvEnabled;
    const campaignsEnabled = process.env.CAMPAIGNS_DISPATCH_ENABLED === 'true' && redisEnvEnabled;
    const bullmqConnected = bullmqEnabled && redisConnected;

    return {
      status: dbHealthy ? 'ok' : 'degraded',
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
          enabled: bullmqEnabled,
          connected: bullmqConnected,
        },
        campaignsDispatch: {
          enabled: campaignsEnabled,
          connected: bullmqConnected,
        },
        cache: {
          driver: cacheDriver,
        },
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
