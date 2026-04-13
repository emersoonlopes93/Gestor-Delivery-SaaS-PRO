import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Public } from '../common/decorators';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    const startedAt = Date.now();

    const dbStartedAt = Date.now();
    const dbHealthy = await this.prisma.isHealthy();
    const dbLatencyMs = Date.now() - dbStartedAt;

    const totalLatencyMs = Date.now() - startedAt;

    const mem = process.memoryUsage();

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
      },
      checks: {
        database: {
          ok: dbHealthy,
          latencyMs: dbLatencyMs,
        },
      },
    };
  }
}
