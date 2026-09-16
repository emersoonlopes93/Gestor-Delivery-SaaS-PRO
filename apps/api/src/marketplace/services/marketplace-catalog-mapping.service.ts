import { BadRequestException, Injectable } from '@nestjs/common';
import { MarketplaceCatalogMappingStatus, MarketplaceProvider } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export type MarketplaceCatalogMappingInput = {
  connectionId: string;
  externalItemId: string;
  externalItemName?: string | null;
  externalReferenceId?: string | null;
  productId: string;
  status?: MarketplaceCatalogMappingStatus;
};

@Injectable()
export class MarketplaceCatalogMappingService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, connectionId?: string) {
    return this.prisma.marketplaceCatalogMapping.findMany({
      where: { tenantId, ...(connectionId ? { connectionId } : {}) },
      include: { connection: { select: { provider: true, externalStoreId: true, displayName: true } }, product: { select: { id: true, name: true, sku: true } } },
      orderBy: [{ updatedAt: 'desc' }],
      take: 500,
    });
  }

  async upsert(tenantId: string, input: MarketplaceCatalogMappingInput) {
    const externalItemId = input.externalItemId.trim();
    if (!externalItemId) throw new BadRequestException('Marketplace external item ID is required.');
    const connection = await this.prisma.marketplaceConnection.findFirst({
      where: { id: input.connectionId, tenantId },
      select: { id: true, provider: true },
    });
    if (!connection) throw new BadRequestException('Marketplace connection not found.');
    const product = await this.prisma.product.findFirst({ where: { id: input.productId, tenantId, deletedAt: null }, select: { id: true } });
    if (!product) throw new BadRequestException('Canonical product not found.');
    return this.prisma.marketplaceCatalogMapping.upsert({
      where: { connectionId_provider_externalItemId: { connectionId: connection.id, provider: connection.provider, externalItemId } },
      create: {
        tenantId,
        connectionId: connection.id,
        provider: connection.provider,
        externalItemId,
        externalItemName: input.externalItemName?.trim() || null,
        externalReferenceId: input.externalReferenceId?.trim() || null,
        productId: product.id,
        status: input.status ?? MarketplaceCatalogMappingStatus.ACTIVE,
      },
      update: {
        externalItemName: input.externalItemName?.trim() || null,
        externalReferenceId: input.externalReferenceId?.trim() || null,
        productId: product.id,
        status: input.status ?? MarketplaceCatalogMappingStatus.ACTIVE,
      },
    });
  }

  async listUnmappedItems(tenantId: string) {
    const [orders, mappings] = await Promise.all([
      this.prisma.marketplaceOrder.findMany({
        where: { tenantId },
        select: {
          connectionId: true,
          provider: true,
          normalizedPayload: true,
          connection: { select: { displayName: true, externalStoreId: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 250,
      }),
      this.prisma.marketplaceCatalogMapping.findMany({
        where: { tenantId, status: MarketplaceCatalogMappingStatus.ACTIVE },
        select: { connectionId: true, provider: true, externalItemId: true },
      }),
    ]);
    const mapped = new Set(mappings.map((mapping) => `${mapping.connectionId}:${mapping.provider}:${mapping.externalItemId}`));
    const candidates = new Map<string, { connectionId: string; provider: MarketplaceProvider; externalItemId: string; externalItemName: string | null; connection: { displayName: string | null; externalStoreId: string | null } }>();
    for (const order of orders) {
      const payload = this.asRecord(order.normalizedPayload);
      const items = Array.isArray(payload?.items) ? payload.items : [];
      for (const value of items) {
        const item = this.asRecord(value);
        const externalItemId = typeof item?.externalItemId === 'string' ? item.externalItemId.trim() : '';
        if (!externalItemId) continue;
        const key = `${order.connectionId}:${order.provider}:${externalItemId}`;
        if (!mapped.has(key) && !candidates.has(key)) candidates.set(key, {
          connectionId: order.connectionId,
          provider: order.provider,
          externalItemId,
          externalItemName: typeof item?.name === 'string' ? item.name : null,
          connection: order.connection,
        });
      }
    }
    return [...candidates.values()];
  }

  async resolveProducts(
    tenantId: string,
    connectionId: string,
    provider: MarketplaceProvider,
    externalItemIds: string[],
  ): Promise<Map<string, string>> {
    const ids = [...new Set(externalItemIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.marketplaceCatalogMapping.findMany({
      where: { tenantId, connectionId, provider, status: MarketplaceCatalogMappingStatus.ACTIVE, externalItemId: { in: ids } },
      select: { externalItemId: true, productId: true },
    });
    return new Map(rows.map((row) => [row.externalItemId, row.productId]));
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  }
}
