import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import type { Request } from 'express';
import { WebhookEventStatus } from '@prisma/client';
import { WebhookSecurityService } from './webhook-security.service';

function mockRequest(body: string, headers: Record<string, string>): Request {
  const lowerHeaders = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    ip: '127.0.0.1',
    rawBody: Buffer.from(body),
    get: (name: string) => lowerHeaders[name.toLowerCase()],
  } as Request;
}

describe('WebhookSecurityService', () => {
  let mockPrisma: Record<string, unknown>;
  let service: WebhookSecurityService;

  beforeEach(() => {
    mockPrisma = {
      externalWebhookEvent: {
        create: jest.fn().mockResolvedValue({ id: 'evt-db-1' }),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new WebhookSecurityService(
      (mockPrisma as unknown) as PrismaService,
      { get: jest.fn((key: string, fallback?: string) => ({
        ASAAS_WEBHOOK_HMAC_SECRET: 'webhook-secret',
        WEBHOOK_REPLAY_WINDOW_SECONDS: '300',
        NODE_ENV: 'production',
      }[key] ?? fallback)) } as ConfigService,
    );
  });

  it('accepts a valid HMAC signature and records the event', async () => {
    const body = '{"event":"PAYMENT_CONFIRMED"}';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', 'webhook-secret')
      .update(`${timestamp}.`)
      .update(Buffer.from(body))
      .digest('hex');

    const result = await service.verifyAndRegister({
      req: mockRequest(body, {
        'x-webhook-signature': `sha256=${signature}`,
        'x-webhook-timestamp': timestamp,
        'x-webhook-id': 'evt-1',
      }),
      provider: 'asaas',
      eventId: 'evt-1',
      hmacSecretEnv: 'ASAAS_WEBHOOK_HMAC_SECRET',
    });

    expect(result.duplicate).toBe(false);
    expect(mockPrisma.externalWebhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: 'asaas',
        eventId: 'evt-1',
        status: WebhookEventStatus.processing,
        attempts: 1,
      }),
    });
  });

  it('rejects missing signatures in production', async () => {
    await expect(service.verifyAndRegister({
      req: mockRequest('{}', { 'x-webhook-timestamp': Math.floor(Date.now() / 1000).toString() }),
      provider: 'asaas',
      eventId: 'evt-2',
      hmacSecretEnv: 'ASAAS_WEBHOOK_HMAC_SECRET',
    })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects timestamps outside the replay window', async () => {
    const body = '{}';
    const timestamp = Math.floor((Date.now() - 10 * 60 * 1000) / 1000).toString();
    const signature = createHmac('sha256', 'webhook-secret')
      .update(`${timestamp}.`)
      .update(Buffer.from(body))
      .digest('hex');

    await expect(service.verifyAndRegister({
      req: mockRequest(body, {
        'x-webhook-signature': signature,
        'x-webhook-timestamp': timestamp,
      }),
      provider: 'asaas',
      eventId: 'evt-old',
      hmacSecretEnv: 'ASAAS_WEBHOOK_HMAC_SECRET',
    })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
