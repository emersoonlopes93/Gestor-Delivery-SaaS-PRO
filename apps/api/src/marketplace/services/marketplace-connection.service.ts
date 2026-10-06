import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MarketplaceConnection, MarketplaceConnectionStatus, MarketplaceProvider, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { MarketplaceCredentialService } from './marketplace-credential.service';

type ManualConnectionInput = {
  externalMerchantId?: string;
  externalStoreId?: string;
  displayName?: string;
  authType?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
  settingsJson?: Prisma.InputJsonValue;
};

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

  async getTenantConnection(tenantId: string, connectionId: string): Promise<MarketplaceConnection> {
    const connection = await this.prisma.marketplaceConnection.findFirst({
      where: { id: connectionId, tenantId },
    });
    if (!connection) throw new NotFoundException('Marketplace connection not found.');
    return connection;
  }

  async connectManual(
    tenantId: string,
    provider: MarketplaceProvider,
    input: ManualConnectionInput,
  ): Promise<MarketplaceConnection> {
    const identifiers = this.normalizeIdentifiers(provider, input);
    await this.assertIdentifiersAvailable(provider, identifiers);
    const data = {
      tenantId,
      provider,
      // A 99Food manual entry only supplies identifiers. It must be validated
      // against `authtoken/get` before it can be presented as connected.
      status: provider === MarketplaceProvider.FOOD_99 && !input.accessToken?.trim()
        ? MarketplaceConnectionStatus.DISCONNECTED
        : MarketplaceConnectionStatus.CONNECTED,
      ...identifiers,
      displayName: input.displayName?.trim() || null,
      authType: input.authType?.trim() || null,
      accessTokenEnc: input.accessToken?.trim()
        ? this.credentials.encrypt(input.accessToken.trim())
        : null,
      refreshTokenEnc: input.refreshToken?.trim()
        ? this.credentials.encrypt(input.refreshToken.trim())
        : null,
      tokenExpiresAt: this.parseTokenExpiration(input.tokenExpiresAt),
      settingsJson: this.sanitizeSettings(input.settingsJson),
    };

    try {
      return await this.prisma.marketplaceConnection.create({ data });
    } catch (error) {
      this.rethrowUniqueIdentifierViolation(error);
      throw error;
    }
  }

  async updateManual(
    tenantId: string,
    connectionId: string,
    input: ManualConnectionInput,
  ): Promise<MarketplaceConnection> {
    const existing = await this.getTenantConnection(tenantId, connectionId);
    const identifiers = this.normalizeIdentifiers(existing.provider, {
      externalMerchantId: input.externalMerchantId ?? existing.externalMerchantId ?? undefined,
      externalStoreId: input.externalStoreId ?? existing.externalStoreId ?? undefined,
    });
    await this.assertIdentifiersAvailable(existing.provider, identifiers, existing.id);

    try {
      return await this.prisma.marketplaceConnection.update({
        where: { id: existing.id, tenantId },
        data: {
          ...identifiers,
          status: existing.provider === MarketplaceProvider.FOOD_99
            && !input.accessToken?.trim()
            && !existing.accessTokenEnc
            ? MarketplaceConnectionStatus.DISCONNECTED
            : MarketplaceConnectionStatus.CONNECTED,
          displayName: input.displayName === undefined ? existing.displayName : input.displayName.trim() || null,
          authType: input.authType === undefined ? existing.authType : input.authType.trim() || null,
          accessTokenEnc: input.accessToken?.trim()
            ? this.credentials.encrypt(input.accessToken.trim())
            : existing.accessTokenEnc,
          refreshTokenEnc: input.refreshToken?.trim()
            ? this.credentials.encrypt(input.refreshToken.trim())
            : existing.refreshTokenEnc,
          tokenExpiresAt: input.tokenExpiresAt === undefined
            ? existing.tokenExpiresAt
            : this.parseTokenExpiration(input.tokenExpiresAt),
          settingsJson: input.settingsJson === undefined
            ? existing.settingsJson ?? undefined
            : this.sanitizeSettings(input.settingsJson),
        },
      });
    } catch (error) {
      this.rethrowUniqueIdentifierViolation(error);
      throw error;
    }
  }

  async disconnectById(tenantId: string, connectionId: string): Promise<MarketplaceConnection> {
    const connection = await this.getTenantConnection(tenantId, connectionId);
    return this.prisma.marketplaceConnection.update({
      where: { id: connection.id, tenantId },
      data: {
        status: MarketplaceConnectionStatus.DISCONNECTED,
        accessTokenEnc: null,
        refreshTokenEnc: null,
        tokenExpiresAt: null,
      },
    });
  }

  async removeUnboundPendingFood99SelfService(tenantId: string, connectionId: string): Promise<void> {
    const connection = await this.getTenantConnection(tenantId, connectionId);
    const isPending = connection.provider === MarketplaceProvider.FOOD_99
      && connection.authType === 'food99_self_service_pending'
      && connection.status !== MarketplaceConnectionStatus.CONNECTED
      && !connection.externalMerchantId
      && !connection.accessTokenEnc
      && !connection.refreshTokenEnc;
    if (!isPending) {
      throw new ConflictException('Only an unbound pending 99Food self-service attempt can be removed.');
    }
    const counts = await this.prisma.marketplaceConnection.findUnique({
      where: { id: connection.id },
      select: { _count: { select: { events: true, orders: true, operations: true, billEntries: true, settlements: true, catalogMappings: true } } },
    });
    const linkedRecords = counts?._count.events
      || counts?._count.orders
      || counts?._count.operations
      || counts?._count.billEntries
      || counts?._count.settlements
      || counts?._count.catalogMappings;
    if (linkedRecords) {
      throw new ConflictException('This 99Food connection has operational records and cannot be removed as a pending attempt.');
    }
    await this.prisma.marketplaceConnection.delete({ where: { id: connection.id } });
  }

  async disconnect(tenantId: string, provider: MarketplaceProvider) {
    const connection = await this.prisma.marketplaceConnection.findFirst({
      where: { tenantId, provider },
      orderBy: [{ createdAt: 'desc' }],
    });
    if (!connection) throw new NotFoundException('Marketplace connection not found.');
    return this.disconnectById(tenantId, connection.id);
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
    const { accessTokenEnc, refreshTokenEnc, ...safeConnection } = connection;
    return {
      ...safeConnection,
      hasAccessToken: Boolean(accessTokenEnc),
      hasRefreshToken: Boolean(refreshTokenEnc),
    };
  }

  private normalizeIdentifiers(
    provider: MarketplaceProvider,
    input: { externalMerchantId?: string; externalStoreId?: string },
  ): { externalMerchantId: string | null; externalStoreId: string | null } {
    const externalMerchantId = input.externalMerchantId?.trim() || null;
    const externalStoreId = input.externalStoreId?.trim() || null;
    if (provider === MarketplaceProvider.IFOOD && !externalMerchantId) {
      throw new BadRequestException('iFood merchantId is required.');
    }
    if (provider === MarketplaceProvider.FOOD_99 && (!externalMerchantId || !externalStoreId)) {
      throw new BadRequestException('99Food merchantId and appShopId are required.');
    }
    return { externalMerchantId, externalStoreId };
  }

  private async assertIdentifiersAvailable(
    provider: MarketplaceProvider,
    identifiers: { externalMerchantId: string | null; externalStoreId: string | null },
    excludeConnectionId?: string,
  ): Promise<void> {
    const candidates = [
      ...(identifiers.externalMerchantId ? [{ externalMerchantId: identifiers.externalMerchantId }] : []),
      ...(identifiers.externalStoreId ? [{ externalStoreId: identifiers.externalStoreId }] : []),
    ];
    if (candidates.length === 0) return;
    const conflict = await this.prisma.marketplaceConnection.findFirst({
      where: {
        provider,
        OR: candidates,
        ...(excludeConnectionId ? { id: { not: excludeConnectionId } } : {}),
      },
      select: { id: true },
    });
    if (conflict) throw new ConflictException('Marketplace merchant or store is already connected.');
  }

  private parseTokenExpiration(value?: string): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid marketplace token expiration.');
    }
    return parsed;
  }

  private rethrowUniqueIdentifierViolation(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Marketplace merchant or store is already connected.');
    }
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
      throw new BadRequestException('Marketplace polling and presence mode must be enabled or disabled together.');
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
