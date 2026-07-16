import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MarketplaceConnection, MarketplaceConnectionStatus, MarketplaceProvider, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { MarketplaceCredentialService } from './marketplace-credential.service';

@Injectable()
export class MarketplaceConnectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: MarketplaceCredentialService,
  ) {}

  listTenantConnections(tenantId: string) {
    return this.prisma.marketplaceConnection.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  getTenantConnectionStatus(tenantId: string, provider: MarketplaceProvider) {
    return this.prisma.marketplaceConnection.findFirst({
      where: { tenantId, provider },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async connectManual(
    tenantId: string,
    provider: MarketplaceProvider,
    input: {
      externalMerchantId?: string;
      externalStoreId?: string;
      displayName?: string;
      authType?: string;
      accessToken?: string;
      refreshToken?: string;
      tokenExpiresAt?: string;
      settingsJson?: Prisma.InputJsonValue;
    },
  ): Promise<MarketplaceConnection> {
    const existing = await this.prisma.marketplaceConnection.findFirst({
      where: { tenantId, provider },
    });
    const tokenExpiresAt = input.tokenExpiresAt ? new Date(input.tokenExpiresAt) : existing?.tokenExpiresAt ?? null;
    if (input.tokenExpiresAt && Number.isNaN(tokenExpiresAt?.getTime())) {
      throw new BadRequestException('Invalid marketplace token expiration.');
    }

    const data = {
      tenantId,
      provider,
      status: MarketplaceConnectionStatus.CONNECTED,
      externalMerchantId: input.externalMerchantId?.trim() || null,
      externalStoreId: input.externalStoreId?.trim() || null,
      displayName: input.displayName?.trim() || null,
      authType: input.authType?.trim() || null,
      accessTokenEnc: input.accessToken?.trim()
        ? this.credentials.encrypt(input.accessToken.trim())
        : existing?.accessTokenEnc ?? null,
      refreshTokenEnc: input.refreshToken?.trim()
        ? this.credentials.encrypt(input.refreshToken.trim())
        : existing?.refreshTokenEnc ?? null,
      tokenExpiresAt,
      settingsJson: this.sanitizeSettings(input.settingsJson),
    };

    if (existing) {
      return this.prisma.marketplaceConnection.update({
        where: { id: existing.id, tenantId },
        data,
      });
    }

    return this.prisma.marketplaceConnection.create({
      data,
    });
  }

  async disconnect(tenantId: string, provider: MarketplaceProvider) {
    const connection = await this.prisma.marketplaceConnection.findFirst({
      where: { tenantId, provider },
    });
    if (!connection) throw new NotFoundException('Marketplace connection not found.');

    return this.prisma.marketplaceConnection.update({
      where: { id: connection.id, tenantId },
      data: {
        status: MarketplaceConnectionStatus.DISCONNECTED,
        accessTokenEnc: null,
        refreshTokenEnc: null,
      },
    });
  }

  async resolveConnection(input: {
    provider: MarketplaceProvider;
    externalMerchantId?: string | null;
    externalStoreId?: string | null;
  }) {
    if (input.externalStoreId) {
      const byStore = await this.prisma.marketplaceConnection.findUnique({
        where: {
          provider_externalStoreId: {
            provider: input.provider,
            externalStoreId: input.externalStoreId,
          },
        },
      });
      if (byStore) return byStore;
    }

    if (input.externalMerchantId) {
      return this.prisma.marketplaceConnection.findUnique({
        where: {
          provider_externalMerchantId: {
            provider: input.provider,
            externalMerchantId: input.externalMerchantId,
          },
        },
      });
    }

    return null;
  }

  maskConnection(connection: MarketplaceConnection) {
    return {
      ...connection,
      accessTokenEnc: connection.accessTokenEnc ? '***' : null,
      refreshTokenEnc: connection.refreshTokenEnc ? '***' : null,
    };
  }

  private sanitizeSettings(settings?: Prisma.InputJsonValue): Prisma.InputJsonObject {
    const record: Record<string, unknown> = typeof settings === 'object' && settings !== null && !Array.isArray(settings)
      ? Object.fromEntries(Object.entries(settings))
      : {};
    const importAsStatus = record.importAsStatus;
    const pollingFallbackEnabled = record.pollingFallbackEnabled === true;
    const presenceMode = record.presenceMode ?? 'WEBHOOK';
    if (presenceMode !== 'WEBHOOK' && presenceMode !== 'POLLING' && presenceMode !== 'DISABLED') {
      throw new BadRequestException('Marketplace presenceMode must be WEBHOOK, POLLING or DISABLED.');
    }
    if (pollingFallbackEnabled !== (presenceMode === 'POLLING')) {
      throw new BadRequestException('iFood polling and presence mode must be enabled or disabled together.');
    }
    return {
      autoConfirmOrders: record.autoConfirmOrders === true,
      pollingFallbackEnabled,
      presenceMode,
      importAsStatus: importAsStatus === 'confirmed' || importAsStatus === 'preparing'
        ? importAsStatus
        : 'pending',
    };
  }
}
