import { NotFoundException } from '@nestjs/common';
import {
  ExternalWebhookEvent,
  PaymentProvider,
  Prisma,
  WebhookEventStatus,
} from '@prisma/client';
import { PaymentWebhookInboxService } from './payment-webhook-inbox.service';
import { createHash } from 'crypto';

const BASE_PAYLOAD = '{"id":"event-a"}';
const BASE_PAYLOAD_HASH = createHash('sha256').update(BASE_PAYLOAD).digest('hex');

function event(overrides: Partial<ExternalWebhookEvent> = {}): ExternalWebhookEvent {
  return {
    id: 'event-db-a',
    provider: PaymentProvider.mercado_pago,
    eventId: 'event-a',
    signatureHash: null,
    receivedAt: new Date('2026-08-20T12:00:00.000Z'),
    processedAt: null,
    status: WebhookEventStatus.processing,
    attempts: 1,
    lastError: null,
    payloadHash: 'payload-hash',
    tenantId: 'tenant-a',
    relatedEntityType: 'order_payment_attempt',
    relatedEntityId: 'attempt-a',
    providerConnectionId: 'connection-a',
    orderPaymentAttemptId: 'attempt-a',
    externalPaymentId: 'payment-a',
    eventType: 'payment.updated',
    metadata: null,
    ...overrides,
  };
}

describe('PaymentWebhookInboxService', () => {
  const prisma = {
    paymentProviderConnection: { findFirst: jest.fn() },
    orderPaymentAttempt: { findFirst: jest.fn() },
    externalWebhookEvent: {
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
  };
  const service = new PaymentWebhookInboxService(prisma as never);
  const baseInput = {
    authenticityVerified: true as const,
    provider: PaymentProvider.mercado_pago,
    externalEventId: 'event-a',
    eventType: 'payment.updated',
    payload: BASE_PAYLOAD,
    tenantId: 'tenant-a',
    providerConnectionId: 'connection-a',
    paymentAttemptId: 'attempt-a',
    externalPaymentId: 'payment-a',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.paymentProviderConnection.findFirst.mockResolvedValue({ id: 'connection-a' });
    prisma.orderPaymentAttempt.findFirst.mockResolvedValue({ externalPaymentId: 'payment-a' });
  });

  it('persists an authenticated event before one logical processing', async () => {
    const processing = event();
    prisma.externalWebhookEvent.create.mockResolvedValue(processing);
    prisma.externalWebhookEvent.update.mockResolvedValue(
      event({ status: WebhookEventStatus.processed, processedAt: new Date() }),
    );
    const process = jest.fn().mockResolvedValue('paid-once');

    const result = await service.registerAuthenticatedAndProcess({ ...baseInput, process });

    expect(process).toHaveBeenCalledTimes(1);
    expect(result.processed).toBe(true);
    expect(result.result).toBe('paid-once');
    expect(prisma.externalWebhookEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        provider: PaymentProvider.mercado_pago,
        eventId: 'event-a',
        tenantId: 'tenant-a',
        providerConnectionId: 'connection-a',
        orderPaymentAttemptId: 'attempt-a',
        externalPaymentId: 'payment-a',
        status: WebhookEventStatus.processing,
      }),
    });
  });

  it('deduplicates a repeated event without repeating paid side effects', async () => {
    const processed = event({
      status: WebhookEventStatus.processed,
      processedAt: new Date(),
      payloadHash: BASE_PAYLOAD_HASH,
    });
    prisma.externalWebhookEvent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '5.22.0',
      }),
    );
    prisma.externalWebhookEvent.findUniqueOrThrow.mockResolvedValue(processed);
    const process = jest.fn();

    const result = await service.registerAuthenticatedAndProcess({ ...baseInput, process });

    expect(result).toEqual(expect.objectContaining({ duplicate: true, processed: true }));
    expect(process).not.toHaveBeenCalled();
  });

  it('allows the same external event ID in a different provider namespace', async () => {
    prisma.externalWebhookEvent.create
      .mockResolvedValueOnce(event())
      .mockResolvedValueOnce(event({ id: 'event-db-b', provider: PaymentProvider.asaas }));
    prisma.externalWebhookEvent.update
      .mockResolvedValueOnce(event({ status: WebhookEventStatus.processed }))
      .mockResolvedValueOnce(event({ id: 'event-db-b', provider: PaymentProvider.asaas, status: WebhookEventStatus.processed }));
    const process = jest.fn().mockResolvedValue(undefined);

    await service.registerAuthenticatedAndProcess({ ...baseInput, process });
    await service.registerAuthenticatedAndProcess({
      ...baseInput,
      provider: PaymentProvider.asaas,
      providerConnectionId: null,
      paymentAttemptId: null,
      externalPaymentId: null,
      process,
    });

    expect(prisma.externalWebhookEvent.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ provider: PaymentProvider.asaas, eventId: 'event-a' }),
    });
  });

  it('rejects a tenant-crossed provider connection before persisting the event', async () => {
    prisma.paymentProviderConnection.findFirst.mockResolvedValue(null);

    await expect(service.registerAuthenticatedAndProcess({
      ...baseInput,
      tenantId: 'tenant-b',
      process: jest.fn(),
    })).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.paymentProviderConnection.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'connection-a',
        tenantId: 'tenant-b',
        provider: PaymentProvider.mercado_pago,
      },
      select: { id: true },
    });
    expect(prisma.externalWebhookEvent.create).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent delivery while the first event is processing', async () => {
    const processing = event({
      payloadHash: BASE_PAYLOAD_HASH,
    });
    prisma.externalWebhookEvent.create
      .mockResolvedValueOnce(processing)
      .mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '5.22.0',
      }));
    prisma.externalWebhookEvent.findUniqueOrThrow.mockResolvedValue(processing);
    prisma.externalWebhookEvent.update.mockResolvedValue(
      event({ status: WebhookEventStatus.processed, processedAt: new Date() }),
    );
    let release: (() => void) | undefined;
    const process = jest.fn(() => new Promise<void>((resolve) => { release = resolve; }));

    const first = service.registerAuthenticatedAndProcess({ ...baseInput, process });
    await Promise.resolve();
    const second = await service.registerAuthenticatedAndProcess({ ...baseInput, process });
    release?.();
    await first;

    expect(second).toEqual(expect.objectContaining({ duplicate: true, processed: false }));
    expect(process).toHaveBeenCalledTimes(1);
  });
});
