import { Injectable, NotFoundException } from '@nestjs/common';
import { MarketplaceConnection, MarketplaceConnectionStatus, MarketplaceProvider, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class MarketplaceConnectionService {
  constructor(private readonly prisma: PrismaService) {}

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
      settingsJson?: Prisma.InputJsonValue;
    },
  ): Promise<MarketplaceConnection> {
    const data = {
      tenantId,
      provider,
      status: MarketplaceConnectionStatus.CONNECTED,
      externalMerchantId: input.externalMerchantId?.trim() || null,
      externalStoreId: input.externalStoreId?.trim() || null,
      displayName: input.displayName?.trim() || null,
      authType: input.authType?.trim() || null,
      accessTokenEnc: input.accessToken?.trim() || null,
      refreshTokenEnc: input.refreshToken?.trim() || null,
      settingsJson: input.settingsJson ?? {
        autoConfirmOrders: false,
        importAsStatus: 'pending',
      },
    };

    const existing = await this.prisma.marketplaceConnection.findFirst({
      where: { tenantId, provider },
    });

    if (existing) {
      return this.prisma.marketplaceConnection.update({
        where: { id: existing.id },
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
      where: { id: connection.id },
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
}
