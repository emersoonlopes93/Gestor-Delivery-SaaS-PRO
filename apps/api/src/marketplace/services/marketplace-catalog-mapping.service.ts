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
        const externalItemId = typeof item?.catalogIdentity === 'string' ? item.catalogIdentity.trim() : '';
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
    const resolved = new Map(rows.map((row) => [row.externalItemId, row.productId]));
    const unresolvedIds = ids.filter((id) => !resolved.has(id));
    if (unresolvedIds.length === 0) return resolved;

    // A provider code is accepted only when it identifies exactly one active
    // product in this tenant. Names and arbitrary order item IDs never enter
    // this path, avoiding cross-store or ambiguous inventory depletion.
    const products = await this.prisma.product.findMany({
      where: {
        tenantId,
        deletedAt: null,
        OR: [
          { id: { in: unresolvedIds } },
          { sku: { in: unresolvedIds } },
        ],
      },
      select: { id: true, sku: true },
    });
    const candidatesByIdentity = new Map<string, Set<string>>();
    for (const product of products) {
      if (unresolvedIds.includes(product.id)) {
        const candidates = candidatesByIdentity.get(product.id) ?? new Set<string>();
        candidates.add(product.id);
        candidatesByIdentity.set(product.id, candidates);
      }
      if (product.sku && unresolvedIds.includes(product.sku)) {
        const candidates = candidatesByIdentity.get(product.sku) ?? new Set<string>();
        candidates.add(product.id);
        candidatesByIdentity.set(product.sku, candidates);
      }
    }
    const automaticMappings = unresolvedIds.flatMap((externalItemId) => {
      const candidates = candidatesByIdentity.get(externalItemId);
      if (!candidates || candidates.size !== 1) return [];
      const [productId] = candidates;
      return [{
        tenantId,
        connectionId,
        provider,
        externalItemId,
        productId,
        status: MarketplaceCatalogMappingStatus.ACTIVE,
        externalReferenceId: 'auto:exact-product-code',
      }];
    });
    if (automaticMappings.length === 0) return resolved;

    await this.prisma.marketplaceCatalogMapping.createMany({
      data: automaticMappings,
      skipDuplicates: true,
    });
    const persistedRows = await this.prisma.marketplaceCatalogMapping.findMany({
      where: { tenantId, connectionId, provider, status: MarketplaceCatalogMappingStatus.ACTIVE, externalItemId: { in: automaticMappings.map((mapping) => mapping.externalItemId) } },
      select: { externalItemId: true, productId: true },
    });
    for (const row of persistedRows) resolved.set(row.externalItemId, row.productId);
    return resolved;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  }
}
