import { ConfigService } from '@nestjs/config';
import {
  PaymentProvider,
  PaymentProviderConnectionStatus,
} from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import { PaymentCredentialService } from './payment-credential.service';
import { PaymentProviderConnectionService } from './payment-provider-connection.service';

describe('PaymentProviderConnectionService', () => {
  const now = new Date('2026-08-20T12:00:00.000Z');
  const connection = {
    id: 'connection-a',
    tenantId: 'tenant-a',
    provider: PaymentProvider.mercado_pago,
    status: PaymentProviderConnectionStatus.CONNECTED,
    externalAccountId: 'seller-a',
    credentialsEncrypted: 'encrypted-value',
    credentialsVersion: 'payment-r1',
    lastVerifiedAt: now,
    disabledAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const prisma = {
    tenant: { findUnique: jest.fn() },
    tenantSettings: { findUnique: jest.fn() },
    paymentProviderConnection: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const credentialService = new PaymentCredentialService(new ConfigService({
    MARKETPLACE_CREDENTIALS_ENCRYPTION_KEY: Buffer.alloc(32, 12).toString('base64'),
    MARKETPLACE_CREDENTIALS_KEY_VERSION: 'payment-r1',
  }));
  const service = new PaymentProviderConnectionService(prisma as never, credentialService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stores encrypted credentials but returns only a safe connection DTO', async () => {
    prisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-a' });
    prisma.paymentProviderConnection.upsert.mockResolvedValue(connection);

    const result = await service.upsertForTenant({
      tenantId: 'tenant-a',
      provider: PaymentProvider.mercado_pago,
      status: PaymentProviderConnectionStatus.CONNECTED,
      externalAccountId: 'seller-a',
      credentials: { accessToken: 'known-access-token' },
    });

    const stored = prisma.paymentProviderConnection.upsert.mock.calls[0][0].create;
    expect(stored.credentialsEncrypted).not.toContain('known-access-token');
    expect(stored.credentialsVersion).toBe('payment-r1');
    expect(JSON.stringify(result)).not.toContain('credentials');
    expect(JSON.stringify(result)).not.toContain('known-access-token');
  });

  it('does not read or update another tenant connection', async () => {
    prisma.paymentProviderConnection.findFirst.mockResolvedValue(null);

    await expect(service.getForTenant('tenant-a', 'connection-b'))
      .rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateStatusForTenant({
      tenantId: 'tenant-a',
      connectionId: 'connection-b',
      status: PaymentProviderConnectionStatus.DISABLED,
    })).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.paymentProviderConnection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'connection-b', tenantId: 'tenant-a' } }),
    );
    expect(prisma.paymentProviderConnection.update).not.toHaveBeenCalled();
  });

  it('migrates legacy Mercado Pago secrets atomically and clears plaintext fields', async () => {
    prisma.paymentProviderConnection.findFirst.mockResolvedValue(null);
    prisma.tenantSettings.findUnique.mockResolvedValue({
      mercadoPagoAccessToken: 'legacy-access-token',
      mercadoPagoPublicKey: 'public-key',
      mercadoPagoWebhookSecret: 'legacy-webhook-secret',
    });
    const tx = {
      paymentProviderConnection: {
        upsert: jest.fn().mockResolvedValue({ id: 'connection-a' }),
      },
      tenantSettings: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma.$transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));

    const result = await service.resolveMercadoPagoCredentials('tenant-a');

    const encrypted = tx.paymentProviderConnection.upsert.mock.calls[0][0].create.credentialsEncrypted;
    expect(encrypted).not.toContain('legacy-access-token');
    expect(tx.tenantSettings.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', mercadoPagoAccessToken: 'legacy-access-token' },
      data: { mercadoPagoAccessToken: null, mercadoPagoWebhookSecret: null },
    });
    expect(result).toEqual({
      connectionId: 'connection-a',
      accessToken: 'legacy-access-token',
      publicKey: 'public-key',
      webhookSecret: 'legacy-webhook-secret',
      legacyStorage: false,
    });
  });
});
