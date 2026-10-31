import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  PaymentProvider,
  PaymentProviderConnectionStatus,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  PaymentCredentialService,
  PaymentProviderCredentials,
} from './payment-credential.service';

export type SafePaymentProviderConnection = {
  id: string;
  provider: PaymentProvider;
  status: PaymentProviderConnectionStatus;
  externalAccountId: string | null;
  lastVerifiedAt: Date | null;
  disabledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ResolvedMercadoPagoCredentials = {
  connectionId: string | null;
  accessToken: string;
  publicKey?: string;
  webhookSecret?: string;
  legacyStorage: boolean;
};

@Injectable()
export class PaymentProviderConnectionService {
  private readonly logger = new Logger(PaymentProviderConnectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentialService: PaymentCredentialService,
  ) {}

  async upsertForTenant(input: {
    tenantId: string;
    provider: PaymentProvider;
    status: PaymentProviderConnectionStatus;
    externalAccountId?: string | null;
    credentials?: PaymentProviderCredentials;
    lastVerifiedAt?: Date | null;
  }): Promise<SafePaymentProviderConnection> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { id: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found.');

    const encrypted = input.credentials
      ? this.credentialService.encryptCredentials(input.credentials)
      : null;
    const connection = await this.prisma.paymentProviderConnection.upsert({
      where: {
        tenantId_provider: {
          tenantId: input.tenantId,
          provider: input.provider,
        },
      },
      create: {
        tenantId: input.tenantId,
        provider: input.provider,
        status: input.status,
        externalAccountId: input.externalAccountId ?? null,
        credentialsEncrypted: encrypted?.encrypted,
        credentialsVersion: encrypted?.version,
        lastVerifiedAt: input.lastVerifiedAt ?? null,
        disabledAt: input.status === PaymentProviderConnectionStatus.DISABLED ? new Date() : null,
      },
      update: {
        status: input.status,
        externalAccountId: input.externalAccountId,
        ...(encrypted
          ? {
              credentialsEncrypted: encrypted.encrypted,
              credentialsVersion: encrypted.version,
            }
          : {}),
        lastVerifiedAt: input.lastVerifiedAt,
        disabledAt: input.status === PaymentProviderConnectionStatus.DISABLED ? new Date() : null,
      },
    });
    return this.toSafeConnection(connection);
  }

  async listForTenant(tenantId: string): Promise<SafePaymentProviderConnection[]> {
    const connections = await this.prisma.paymentProviderConnection.findMany({
      where: { tenantId },
      orderBy: { provider: 'asc' },
    });
    return connections.map((connection) => this.toSafeConnection(connection));
  }

  async getForTenant(tenantId: string, connectionId: string): Promise<SafePaymentProviderConnection> {
    const connection = await this.prisma.paymentProviderConnection.findFirst({
      where: { id: connectionId, tenantId },
    });
    if (!connection) throw new NotFoundException('Payment provider connection not found.');
    return this.toSafeConnection(connection);
  }

  async updateStatusForTenant(input: {
    tenantId: string;
    connectionId: string;
    status: PaymentProviderConnectionStatus;
  }): Promise<SafePaymentProviderConnection> {
    const existing = await this.prisma.paymentProviderConnection.findFirst({
      where: { id: input.connectionId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Payment provider connection not found.');

    const connection = await this.prisma.paymentProviderConnection.update({
      where: { id: existing.id },
      data: {
        status: input.status,
        disabledAt: input.status === PaymentProviderConnectionStatus.DISABLED ? new Date() : null,
      },
    });
    return this.toSafeConnection(connection);
  }

  async readCredentialsForTenant(input: {
    tenantId: string;
    connectionId: string;
    provider: PaymentProvider;
  }): Promise<PaymentProviderCredentials> {
    const connection = await this.prisma.paymentProviderConnection.findFirst({
      where: {
        id: input.connectionId,
        tenantId: input.tenantId,
        provider: input.provider,
        status: PaymentProviderConnectionStatus.CONNECTED,
      },
      select: { credentialsEncrypted: true },
    });
    if (!connection?.credentialsEncrypted) {
      throw new NotFoundException('Connected payment provider credentials not found.');
    }
    return this.credentialService.decryptCredentials(connection.credentialsEncrypted);
  }

  async resolveMercadoPagoCredentials(tenantId: string): Promise<ResolvedMercadoPagoCredentials | null> {
    const connection = await this.prisma.paymentProviderConnection.findFirst({
      where: {
        tenantId,
        provider: PaymentProvider.mercado_pago,
        status: PaymentProviderConnectionStatus.CONNECTED,
      },
      select: { id: true, credentialsEncrypted: true },
    });
    if (connection?.credentialsEncrypted) {
      const credentials = this.credentialService.decryptCredentials(connection.credentialsEncrypted);
      const accessToken = credentials.accessToken?.trim();
      if (!accessToken) throw new ServiceUnavailableException('Mercado Pago connection has no access token.');
      return {
        connectionId: connection.id,
        accessToken,
        publicKey: credentials.publicKey?.trim() || undefined,
        webhookSecret: credentials.webhookSecret?.trim() || undefined,
        legacyStorage: false,
      };
    }

    const legacy = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: {
        mercadoPagoAccessToken: true,
        mercadoPagoPublicKey: true,
        mercadoPagoWebhookSecret: true,
      },
    });
    const accessToken = legacy?.mercadoPagoAccessToken?.trim();
    if (!accessToken) return null;

    const credentials = {
      accessToken,
      ...(legacy?.mercadoPagoPublicKey?.trim() ? { publicKey: legacy.mercadoPagoPublicKey.trim() } : {}),
      ...(legacy?.mercadoPagoWebhookSecret?.trim()
        ? { webhookSecret: legacy.mercadoPagoWebhookSecret.trim() }
        : {}),
    };

    try {
      const encrypted = this.credentialService.encryptCredentials(credentials);
      const migrated = await this.prisma.$transaction(async (tx) => {
        const result = await tx.paymentProviderConnection.upsert({
          where: {
            tenantId_provider: {
              tenantId,
              provider: PaymentProvider.mercado_pago,
            },
          },
          create: {
            tenantId,
            provider: PaymentProvider.mercado_pago,
            status: PaymentProviderConnectionStatus.CONNECTED,
            credentialsEncrypted: encrypted.encrypted,
            credentialsVersion: encrypted.version,
          },
          update: {
            status: PaymentProviderConnectionStatus.CONNECTED,
            credentialsEncrypted: encrypted.encrypted,
            credentialsVersion: encrypted.version,
            disabledAt: null,
          },
          select: { id: true },
        });
        await tx.tenantSettings.updateMany({
          where: { tenantId, mercadoPagoAccessToken: legacy.mercadoPagoAccessToken },
          data: {
            mercadoPagoAccessToken: null,
            mercadoPagoWebhookSecret: null,
          },
        });
        return result;
      });
      this.logger.log({
        message: 'payment_provider_legacy_credentials_migrated',
        tenantId,
        provider: PaymentProvider.mercado_pago,
        connectionId: migrated.id,
      });
      return {
        connectionId: migrated.id,
        ...credentials,
        legacyStorage: false,
      };
    } catch (error) {
      if (!(error instanceof ServiceUnavailableException)) throw error;
      this.logger.warn({
        message: 'payment_provider_legacy_credentials_require_migration',
        tenantId,
        provider: PaymentProvider.mercado_pago,
        reason: 'encryption_key_unavailable',
      });
      return {
        connectionId: null,
        ...credentials,
        legacyStorage: true,
      };
    }
  }

  private toSafeConnection(connection: {
    id: string;
    provider: PaymentProvider;
    status: PaymentProviderConnectionStatus;
    externalAccountId: string | null;
    lastVerifiedAt: Date | null;
    disabledAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): SafePaymentProviderConnection {
    return {
      id: connection.id,
      provider: connection.provider,
      status: connection.status,
      externalAccountId: connection.externalAccountId,
      lastVerifiedAt: connection.lastVerifiedAt,
      disabledAt: connection.disabledAt,
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }
}
