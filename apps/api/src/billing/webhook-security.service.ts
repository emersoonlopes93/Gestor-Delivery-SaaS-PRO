import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, WebhookEventStatus } from '@prisma/client';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { PrismaService } from '../database/prisma.service';

type VerifyWebhookInput = {
  req: Request;
  provider: string;
  eventId?: string | null;
  legacyToken?: string;
  legacySecretEnv?: string;
  hmacSecretEnv: string;
  allowLegacyEnv?: string;
  tenantId?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
};

type VerifiedWebhook = {
  eventId: string;
  payloadHash: string;
  signatureHash: string | null;
  duplicate: boolean;
  dbEventId: string | null;
};

@Injectable()
export class WebhookSecurityService {
  private readonly logger = new Logger(WebhookSecurityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async verifyAndRegister(input: VerifyWebhookInput): Promise<VerifiedWebhook> {
    const rawBody = this.rawBody(input.req);
    const payloadHash = this.sha256(rawBody);
    const eventId = this.resolveEventId(input, payloadHash);
    const secret = this.config.get<string>(input.hmacSecretEnv)?.trim();
    const nodeEnv = this.config.get<string>('NODE_ENV', 'development');
    const allowLegacy = this.config.get<string>(input.allowLegacyEnv ?? 'WEBHOOK_ALLOW_LEGACY_TOKEN', 'false') === 'true';

    let signatureHash: string | null = null;
    if (secret) {
      signatureHash = this.verifyHmac(input.req, rawBody, secret, input.provider);
    } else if (nodeEnv === 'production' || !allowLegacy) {
      this.logger.warn({
        message: 'webhook_rejected',
        provider: input.provider,
        eventId,
        reason: 'missing_hmac_secret',
      });
      throw new UnauthorizedException('Webhook HMAC secret not configured');
    } else {
      this.verifyLegacyToken(input);
    }

    try {
      const created = await this.prisma.externalWebhookEvent.create({
        data: {
          provider: input.provider,
          eventId,
          signatureHash,
          payloadHash,
          status: WebhookEventStatus.processing,
          attempts: 1,
          tenantId: input.tenantId ?? null,
          relatedEntityType: input.relatedEntityType ?? null,
          relatedEntityId: input.relatedEntityId ?? null,
          metadata: {
            userAgent: input.req.get('user-agent') ?? null,
            ipAddress: input.req.ip,
          },
        },
      });
      this.logger.log({
        message: 'webhook_accepted',
        provider: input.provider,
        eventId,
        payloadHash: payloadHash.slice(0, 16),
      });
      return { eventId, payloadHash, signatureHash, duplicate: false, dbEventId: created.id };
    } catch (err) {
      if (this.isUniqueConstraint(err)) {
        const existing = await this.prisma.externalWebhookEvent.findUnique({
          where: { provider_eventId: { provider: input.provider, eventId } },
        });
        if (existing?.status === WebhookEventStatus.processed) {
          this.logger.log({
            message: 'webhook_duplicate',
            provider: input.provider,
            eventId,
            status: existing.status,
          });
          return { eventId, payloadHash, signatureHash, duplicate: true, dbEventId: existing.id };
        }
        await this.prisma.externalWebhookEvent.update({
          where: { provider_eventId: { provider: input.provider, eventId } },
          data: {
            status: WebhookEventStatus.duplicate,
            attempts: { increment: 1 },
            lastError: 'duplicate_delivery_while_not_processed',
          },
        });
        return { eventId, payloadHash, signatureHash, duplicate: true, dbEventId: existing?.id ?? null };
      }
      throw err;
    }
  }

  async markProcessed(dbEventId: string | null) {
    if (!dbEventId) return;
    await this.prisma.externalWebhookEvent.update({
      where: { id: dbEventId },
      data: {
        status: WebhookEventStatus.processed,
        processedAt: new Date(),
        lastError: null,
      },
    });
  }

  async markFailed(dbEventId: string | null, error: unknown) {
    if (!dbEventId) return;
    const message = error instanceof Error ? error.message : String(error);
    await this.prisma.externalWebhookEvent.update({
      where: { id: dbEventId },
      data: {
        status: WebhookEventStatus.failed,
        lastError: message.slice(0, 1000),
      },
    });
  }

  private verifyHmac(req: Request, rawBody: Buffer, secret: string, provider: string) {
    const signature = req.get('x-webhook-signature')?.trim();
    const timestamp = req.get('x-webhook-timestamp')?.trim();
    if (!signature || !timestamp) {
      throw new UnauthorizedException('Missing webhook signature');
    }

    const timestampMs = Number(timestamp) * 1000;
    if (!Number.isFinite(timestampMs)) {
      throw new BadRequestException('Invalid webhook timestamp');
    }
    const replayWindowSeconds = Number(this.config.get<string>('WEBHOOK_REPLAY_WINDOW_SECONDS', '300'));
    const driftSeconds = Math.abs(Date.now() - timestampMs) / 1000;
    if (driftSeconds > replayWindowSeconds) {
      this.logger.warn({
        message: 'webhook_rejected',
        provider,
        reason: 'timestamp_outside_window',
        driftSeconds: Math.round(driftSeconds),
      });
      throw new UnauthorizedException('Webhook timestamp outside replay window');
    }

    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest('hex');
    const received = signature.replace(/^sha256=/, '');
    if (!this.safeEqual(received, expected)) {
      this.logger.warn({
        message: 'webhook_rejected',
        provider,
        reason: 'invalid_signature',
        signatureHash: this.sha256(Buffer.from(received)).slice(0, 16),
      });
      throw new UnauthorizedException('Invalid webhook signature');
    }
    return this.sha256(Buffer.from(received));
  }

  private verifyLegacyToken(input: VerifyWebhookInput) {
    if (!input.legacySecretEnv) {
      throw new UnauthorizedException('Webhook signature required');
    }
    const expectedToken = this.config.get<string>(input.legacySecretEnv)?.trim();
    if (!expectedToken || !input.legacyToken || input.legacyToken !== expectedToken) {
      throw new UnauthorizedException('Invalid legacy webhook token');
    }
  }

  private resolveEventId(input: VerifyWebhookInput, payloadHash: string) {
    const headerId = input.req.get('x-webhook-id')?.trim();
    const candidate = headerId || input.eventId?.trim();
    if (candidate) return candidate;
    const timestamp = input.req.get('x-webhook-timestamp')?.trim() ?? 'no-ts';
    return `${payloadHash}:${timestamp}`;
  }

  private rawBody(req: Request) {
    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!raw) {
      throw new BadRequestException('Raw webhook body unavailable');
    }
    return raw;
  }

  private sha256(value: Buffer) {
    return createHash('sha256').update(value).digest('hex');
  }

  private safeEqual(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }

  private isUniqueConstraint(err: unknown): err is Prisma.PrismaClientKnownRequestError {
    return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
  }
}
