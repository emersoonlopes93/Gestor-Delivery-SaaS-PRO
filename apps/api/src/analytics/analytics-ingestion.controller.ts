import { BadRequestException, Body, Controller, Headers, HttpCode, Param, PayloadTooLargeException, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { AnalyticsPublicBrowserEventV1Schema } from '@gestor/types';
import { Public } from '../common/decorators';
import { AnalyticsIngestionService } from './analytics-ingestion.service';

const MAX_BATCH_SIZE = 20;
const MAX_BODY_BYTES = 64 * 1024;
const AnalyticsBatchSchema = z.object({ events: z.array(AnalyticsPublicBrowserEventV1Schema).min(1).max(MAX_BATCH_SIZE) }).strict();

@Controller('public/storefront/:slug/analytics')
export class AnalyticsIngestionController {
  constructor(private readonly ingestionService: AnalyticsIngestionService) {}

  @Post('events')
  @Public()
  @HttpCode(201)
  @Throttle({ public: { limit: 30, ttl: 60 } })
  async ingest(
    @Param('slug') slug: string,
    @Headers('content-length') contentLength: string | undefined,
    @Body() body: unknown,
  ) {
    if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
      throw new PayloadTooLargeException('request body too large');
    }
    const parsed = AnalyticsBatchSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('invalid analytics event batch');

    const tenant = await this.ingestionService.resolveActiveTenant(slug);
    return this.ingestionService.ingest(tenant.id, parsed.data.events);
  }
}
