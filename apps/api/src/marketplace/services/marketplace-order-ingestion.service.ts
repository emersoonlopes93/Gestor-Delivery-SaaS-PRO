import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { MarketplaceEventStatus, MarketplaceProvider, OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { MarketplaceProviderRegistryService } from './marketplace-provider-registry.service';
import { MarketplaceConnectionService } from './marketplace-connection.service';
import { CustomerService } from '../../crm/customer.service';
import { OrdersGateway } from '../../orders/orders.gateway';
import { OrdersService } from '../../orders/orders.service';
import { generatePublicTrackingToken } from '../../common/utils/tracking-token.util';
import { NormalizedMarketplaceOrder } from '../marketplace.types';

@Injectable()
export class MarketplaceOrderIngestionService {
  private readonly logger = new Logger(MarketplaceOrderIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: MarketplaceProviderRegistryService,
    private readonly connectionService: MarketplaceConnectionService,
    private readonly customerService: CustomerService,
    private readonly ordersGateway: OrdersGateway,
    private readonly ordersService: OrdersService,
  ) {}

  async processInboxEvent(eventInboxId: string) {
    const inbox = await this.prisma.marketplaceEventInbox.findUnique({
      where: { id: eventInboxId },
      include: { connection: true },
    });
    if (!inbox) throw new BadRequestException('Marketplace event inbox not found.');

    const connection = inbox.connection ?? await this.connectionService.resolveConnection({
      provider: inbox.provider,
      externalMerchantId: inbox.externalMerchantId,
      externalStoreId: inbox.externalStoreId,
    });

    if (!connection) {
      await this.failInbox(inbox.id, 'Marketplace connection not found for event.');
      return;
    }

    await this.prisma.marketplaceEventInbox.update({
      where: { id: inbox.id },
      data: {
        status: MarketplaceEventStatus.PROCESSING,
        attempts: { increment: 1 },
        tenantId: connection.tenantId,
        connectionId: connection.id,
      },
    });

    try {
      const provider = this.providerRegistry.get(inbox.provider);
      const externalOrderId = inbox.externalOrderId?.trim() || this.readString(inbox.rawPayload, ['orderId', 'id']);
      if (!externalOrderId) {
        throw new Error('externalOrderId missing in marketplace payload.');
      }

      const externalOrder = await provider.fetchOrderDetails({
        connection,
        externalOrderId,
        eventPayload: this.asRecord(inbox.rawPayload) ?? {},
      });

      const normalizedOrder = await provider.normalizeOrder({
        connection,
        externalOrder,
      });

      const marketplaceOrder = await this.upsertMarketplaceOrder(connection.tenantId, connection.id, normalizedOrder);
      if (!marketplaceOrder.internalOrderId) {
        const internalOrderId = await this.createInternalOrderFromNormalized(normalizedOrder);
        await this.prisma.marketplaceOrder.update({
          where: {
            tenantId_provider_externalOrderId: {
              tenantId: connection.tenantId,
              provider: normalizedOrder.provider,
              externalOrderId: normalizedOrder.externalOrderId,
            },
          },
          data: {
            internalOrderId,
            statusInternal: this.resolveInitialStatus(connection),
            importedAt: new Date(),
            lastSyncedAt: new Date(),
          },
        });

        const orderDetail = await this.ordersService.getOrderDetail(internalOrderId, connection.tenantId);
        this.ordersGateway.emitNewOrder(connection.tenantId, {
          ...orderDetail,
          itemCount: orderDetail.items.length,
        });

        const initialStatus = this.resolveInitialStatus(connection);
        if (initialStatus !== OrderStatus.pending) {
          await this.ordersService.updateOrderStatus(
            internalOrderId,
            connection.tenantId,
            { status: initialStatus, note: 'Status inicial importado do marketplace.' },
          );
        }
      }

      await this.prisma.marketplaceEventInbox.update({
        where: { id: inbox.id },
        data: {
          status: MarketplaceEventStatus.PROCESSED,
          processedAt: new Date(),
          lastError: null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown marketplace ingestion error.';
      await this.failInbox(inbox.id, message);
      throw error;
    }
  }

  async reprocessMarketplaceOrder(marketplaceOrderId: string, tenantId: string) {
    const record = await this.prisma.marketplaceOrder.findFirst({
      where: { id: marketplaceOrderId, tenantId },
      include: { connection: true },
    });
    if (!record) throw new BadRequestException('Marketplace order not found.');

    if (record.internalOrderId) {
      return { success: true, skipped: true, reason: 'already_imported', internalOrderId: record.internalOrderId };
    }

    const provider = this.providerRegistry.get(record.provider);
    const normalized = await provider.normalizeOrder({
      connection: record.connection,
      externalOrder: this.asRecord(record.rawPayload) ?? {},
    });
    const internalOrderId = await this.createInternalOrderFromNormalized(normalized);
    await this.prisma.marketplaceOrder.update({
      where: { id: record.id },
      data: {
        internalOrderId,
        statusInternal: this.resolveInitialStatus(record.connection),
        importedAt: new Date(),
        lastSyncedAt: new Date(),
      },
    });

    return { success: true, internalOrderId };
  }

  private async upsertMarketplaceOrder(
    tenantId: string,
    connectionId: string,
    normalized: NormalizedMarketplaceOrder,
  ) {
    return this.prisma.marketplaceOrder.upsert({
      where: {
        tenantId_provider_externalOrderId: {
          tenantId,
          provider: normalized.provider,
          externalOrderId: normalized.externalOrderId,
        },
      },
      create: {
        tenantId,
        connectionId,
        provider: normalized.provider,
        externalOrderId: normalized.externalOrderId,
        externalDisplayId: normalized.externalDisplayId ?? null,
        statusExternal: normalized.externalStatus ?? null,
        statusInternal: this.resolveInitialStatusValue(connectionId, normalized),
        rawPayload: normalized.rawPayload as Prisma.InputJsonValue,
        normalizedPayload: normalized as unknown as Prisma.InputJsonValue,
      },
      update: {
        externalDisplayId: normalized.externalDisplayId ?? null,
        statusExternal: normalized.externalStatus ?? null,
        rawPayload: normalized.rawPayload as Prisma.InputJsonValue,
        normalizedPayload: normalized as unknown as Prisma.InputJsonValue,
        lastSyncedAt: new Date(),
      },
    });
  }

  private async createInternalOrderFromNormalized(normalized: NormalizedMarketplaceOrder): Promise<string> {
    const tenantId = normalized.connection.tenantId;
    const idempotencyKey = `marketplace:ifood:${normalized.externalOrderId}`;
    const existing = await this.prisma.order.findFirst({
      where: {
        tenantId,
        idempotencyKey,
      },
    });
    if (existing) return existing.id;

    let customerId: string | null = null;
    if (normalized.customerPhone) {
      const customer = await this.customerService.syncCustomerOnOrderUpsert(
        tenantId,
        normalized.customerPhone,
        normalized.customerName,
        normalized.customerEmail ?? undefined,
      );
      customerId = customer?.id ?? null;
    }

    const itemsSubtotal = normalized.items.reduce((sum, item) => sum + item.totalPrice, 0);
    const order = await this.prisma.$transaction(async (tx) => {
      const updatedTenant = await tx.tenant.update({
        where: { id: tenantId },
        data: { orderSequence: { increment: 1 } },
        select: { orderSequence: true },
      });

      const orderNumber = `#${updatedTenant.orderSequence.toString().padStart(4, '0')}`;
      const created = await tx.order.create({
        data: {
          tenantId,
          orderNumber,
          status: OrderStatus.pending,
          fulfillmentType: normalized.fulfillmentType,
          customerName: normalized.customerName,
          customerPhone: normalized.customerPhone,
          customerEmail: normalized.customerEmail ?? null,
          itemsSubtotal,
          discountTotal: 0,
          deliveryFee: 0,
          serviceFee: 0,
          total: itemsSubtotal,
          sourceChannel: 'marketplace_ifood',
          idempotencyKey,
          notes: normalized.notes ?? null,
          customerId,
          paymentMethod: (normalized.paymentMethod ?? PaymentMethod.other) as PaymentMethod,
          publicTrackingToken: generatePublicTrackingToken(),
        },
      });

      for (const item of normalized.items) {
        await tx.orderItem.create({
          data: {
            orderId: created.id,
            tenantId,
            lineType: 'product',
            productId: item.productId ?? null,
            comboId: null,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineTotal: item.totalPrice,
            notes: item.notes ?? null,
            snapshotName: item.name,
            snapshotImage: null,
            snapshotBasePrice: item.unitPrice,
            snapshotExtrasTotal: 0,
            snapshotComposition: null,
          },
        });
      }

      if (normalized.fulfillmentType === 'delivery' && normalized.deliveryAddress) {
        await tx.orderDeliveryAddress.create({
          data: {
            orderId: created.id,
            tenantId,
            street: normalized.deliveryAddress.street,
            number: normalized.deliveryAddress.number,
            complement: normalized.deliveryAddress.complement ?? null,
            neighborhood: normalized.deliveryAddress.neighborhood,
            city: normalized.deliveryAddress.city,
            state: normalized.deliveryAddress.state,
            zipCode: normalized.deliveryAddress.zipCode,
            reference: normalized.deliveryAddress.reference ?? null,
            lat: normalized.deliveryAddress.lat ?? null,
            lng: normalized.deliveryAddress.lng ?? null,
          },
        });
      }

      await tx.orderTimeline.create({
        data: {
          orderId: created.id,
          tenantId,
          status: OrderStatus.pending,
          note: `Pedido importado via marketplace_ifood (${normalized.externalOrderId}).`,
          actorType: 'system',
        },
      });

      return created;
    });

    return order.id;
  }

  private resolveInitialStatus(connection: { settingsJson?: Prisma.JsonValue | null }): OrderStatus {
    const settings = this.asRecord(connection.settingsJson);
    const configured = settings?.importAsStatus;
    if (configured === 'confirmed') return OrderStatus.confirmed;
    if (configured === 'preparing') return OrderStatus.preparing;
    return OrderStatus.pending;
  }

  private resolveInitialStatusValue(
    _connectionId: string,
    normalized: NormalizedMarketplaceOrder,
  ): string {
    return normalized.externalStatus ?? OrderStatus.pending;
  }

  private async failInbox(inboxId: string, message: string) {
    await this.prisma.marketplaceEventInbox.update({
      where: { id: inboxId },
      data: {
        status: MarketplaceEventStatus.FAILED,
        lastError: message,
      },
    });
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  }

  private readString(value: Prisma.JsonValue, keys: string[]): string | null {
    const record = this.asRecord(value);
    if (!record) return null;
    for (const key of keys) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }
    return null;
  }
}
