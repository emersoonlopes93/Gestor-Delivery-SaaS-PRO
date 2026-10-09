import { Controller, Get, Param, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../rbac/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators';
import { Queue } from 'bullmq';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

function getBullmqRedisConnectionOptions() {
  if (process.env.REDIS_URL) {
    const url = new URL(process.env.REDIS_URL);
    return {
      host: url.hostname,
      port: Number(url.port) || 6379,
      password: url.password || undefined,
      username: url.username || undefined,
      tls: url.protocol === 'rediss:' ? { rejectUnauthorized: false } : undefined,
    };
  }
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB) || 0,
  };
}

@ApiTags('Admin Queues')
@ApiBearerAuth()
@Controller('admin/queues')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('view_admin_dashboard')
export class AdminQueuesController {
  
  @Get()
  @ApiOperation({ summary: 'Lista o status básico das filas conhecidas (Admin)' })
  async listQueues() {
    const knownQueues = ['campaign-dispatch', 'marketplace-events', 'orders'];
    const connection = getBullmqRedisConnectionOptions();
    if (!connection) {
      return { status: 'redis_disabled', queues: [] };
    }

    const results = [];
    for (const qName of knownQueues) {
      const queue = new Queue(qName, { connection });
      try {
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          queue.getWaitingCount(),
          queue.getActiveCount(),
          queue.getCompletedCount(),
          queue.getFailedCount(),
          queue.getDelayedCount(),
        ]);
        results.push({
          name: qName,
          metrics: { waiting, active, completed, failed, delayed }
        });
      } catch (err) {
        results.push({ name: qName, status: 'error', message: err instanceof Error ? err.message : String(err) });
      } finally {
        await queue.close();
      }
    }
    return { status: 'ok', queues: results };
  }

  @Get(':queueName/failed')
  @ApiOperation({ summary: 'Inspeciona a Dead-Letter Queue (jobs falhos) de uma fila' })
  async inspectFailedJobs(
    @Param('queueName') queueName: string,
    @Query('limit') limitStr?: string,
  ) {
    const connection = getBullmqRedisConnectionOptions();
    if (!connection) {
      return { status: 'redis_disabled', jobs: [] };
    }

    const limit = parseInt(limitStr || '50', 10);
    const queue = new Queue(queueName, { connection });
    try {
      // Pega os jobs do estado 'failed'
      const failedJobs = await queue.getFailed(0, limit - 1);
      
      const mapped = failedJobs.map(job => ({
        id: job.id,
        name: job.name,
        failedReason: job.failedReason,
        tenantId: job.data?.tenantId,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp,
        finishedOn: job.finishedOn,
        dataSnippet: job.data, // Expor o payload para inspecao basica
      }));

      return {
        queue: queueName,
        failedCount: await queue.getFailedCount(),
        inspected: mapped.length,
        jobs: mapped,
      };
    } finally {
      await queue.close();
    }
  }
}
