/* eslint-disable @typescript-eslint/no-unused-vars */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  MarketplaceDivergenceType,
  MarketplaceEventStatus,
  MarketplaceOperationStatus,
  MarketplaceOperationType,
  MarketplaceProvider,
  OrderStatus,
  PaymentMethod,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { MarketplaceProviderRegistryService } from './marketplace-provider-registry.service';
import { MarketplaceConnectionService } from './marketplace-connection.service';
import { CustomerService } from '../../crm/customer.service';
import { OrdersGateway } from '../../orders/orders.gateway';
import { OrdersService } from '../../orders/orders.service';
import { generatePublicTrackingToken } from '../../common/utils/tracking-token.util';
import { NormalizedMarketplaceOrder } from '../marketplace.types';
import { ORDER_STATUS_TRANSITIONS } from '@gestor/types';
import { MarketplaceStatusSyncService } from './marketplace-status-sync.service';
import { MarketplaceDivergenceService } from './marketplace-divergence.service';
import { buildMarketplaceOrderIdempotencyKey } from '../marketplace-idempotency';

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
    private readonly statusSyncService: MarketplaceStatusSyncService,
    private readonly divergenceService: MarketplaceDivergenceService,
  ) {}

  async processInboxEvent(eventInboxId: string) {
    const inbox = await this.prisma.marketplaceEventInbox.findUnique({
      where: { id: eventInboxId },
      include: { connection: true },
    });
    if (!inbox) throw new BadRequestException('Marketplace event inbox not found.');
    if (inbox.status === MarketplaceEventStatus.PROCESSED || inbox.status === MarketplaceEventStatus.IGNORED) {
      return { processed: true, duplicate: true };
    }

    const connection = inbox.connection ?? await this.connectionService.resolveConnection({
      provider: inbox.provider,
      externalMerchantId: inbox.externalMerchantId,
      externalStoreId: inbox.externalStoreId,
    });

    if (!connection) {
      await this.failInbox(inbox.id, 'Marketplace connection not found for event.');
      this.logger.error({
        message: 'marketplace_merchant_mapping_failure',
        merchantId: this.maskExternalIdentifier(inbox.externalMerchantId),
        storeId: this.maskExternalIdentifier(inbox.externalStoreId),
        externalOrderId: inbox.externalOrderId,
        eventId: inbox.eventId,
        correlationId: inbox.correlationId,
      });
      throw new BadRequestException('Marketplace connection not found for event.');
    }

    const claimed = await this.prisma.marketplaceEventInbox.updateMany({
      where: {
        id: inbox.id,
        status: {
          in: [MarketplaceEventStatus.RECEIVED, MarketplaceEventStatus.QUEUED, MarketplaceEventStatus.FAILED],
        },
      },
      data: {
        status: MarketplaceEventStatus.PROCESSING,
        attempts: { increment: 1 },
        tenantId: connection.tenantId,
        connectionId: connection.id,
        processingStartedAt: new Date(),
      },
    });
    if (claimed.count === 0) return { processed: false, duplicate: true };

    try {
      const provider = this.providerRegistry.get(inbox.provider);
      const externalOrderId = inbox.externalOrderId?.trim() || this.readString(inbox.rawPayload, ['orderId', 'id']);
      if (!externalOrderId) {
        throw new Error('externalOrderId missing in marketplace payload.');
      }

      const existingOrder = await this.prisma.marketplaceOrder.findFirst({
        where: { connectionId: connection.id, provider: inbox.provider, externalOrderId },
        select: {
          lastExternalEventAt: true,
          lastExternalEventSequence: true,
          lastExternalEventTopic: true,
        },
      });
      if (existingOrder && this.isOlderEvent(inbox, existingOrder)) {
        await this.prisma.marketplaceEventInbox.update({
          where: { id: inbox.id },
          data: {
            status: MarketplaceEventStatus.IGNORED,
            processedAt: new Date(),
            lastError: 'out_of_order_event_suppressed',
          },
        });
        this.logger.warn({
          message: 'marketplace_event_out_of_order',
          tenantId: connection.tenantId,
          connectionId: connection.id,
          merchantId: this.maskExternalIdentifier(connection.externalMerchantId),
          externalOrderId,
          eventId: inbox.eventId,
          correlationId: inbox.correlationId,
        });
        return { processed: true, ignored: true, reason: 'out_of_order' };
      }

      if (existingOrder && this.isNativeFood99LifecycleTopic(inbox.provider, inbox.topic)) {
        await this.applyLifecycleForInbox(connection.tenantId, connection.id, externalOrderId, inbox.topic);
        await this.markInboxProcessed(inbox.id);
        return { processed: true, lifecycleOnly: true };
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

      const marketplaceOrder = await this.upsertMarketplaceOrder(
        connection.tenantId,
        connection.id,
        normalizedOrder,
        {
          id: inbox.eventId,
          createdAt: inbox.eventCreatedAt,
          sequence: inbox.eventSequence,
          topic: inbox.topic,
        },
      );
      if (marketplaceOrder.confirmationDeadlineAt) {
        const remainingMs = marketplaceOrder.confirmationDeadlineAt.getTime() - Date.now();
        if (remainingMs <= 2 * 60 * 1000) {
          this.logger.warn({
            message: remainingMs <= 0
              ? 'marketplace_confirmation_deadline_expired'
              : 'marketplace_confirmation_deadline_near',
            tenantId: connection.tenantId,
            connectionId: connection.id,
            merchantId: this.maskExternalIdentifier(connection.externalMerchantId),
            orderId: marketplaceOrder.internalOrderId,
            externalOrderId,
            eventId: inbox.eventId,
            correlationId: inbox.correlationId,
            deadlineAt: marketplaceOrder.confirmationDeadlineAt,
            remainingMs,
          });
        }
        if (remainingMs <= 0) {
          await this.divergenceService.record({
            tenantId: connection.tenantId,
            marketplaceOrderId: marketplaceOrder.id,
            internalOrderId: marketplaceOrder.internalOrderId,
            provider: marketplaceOrder.provider,
            externalOrderId,
            type: MarketplaceDivergenceType.OPERATION_TIMEOUT,
            localState: marketplaceOrder.statusInternal,
            remoteState: marketplaceOrder.statusExternal,
            reason: 'Order was ingested after the official confirmation deadline.',
            recommendedAction: 'Inspect the remote order before attempting confirmation.',
            correlationId: inbox.correlationId,
          });
        }
      }
      if (!marketplaceOrder.internalOrderId) {
        const internalOrderId = await this.createInternalOrderFromNormalized(normalizedOrder);
        await this.prisma.marketplaceOrder.update({
          where: {
            connectionId_provider_externalOrderId: {
              connectionId: connection.id,
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
            undefined,
            { marketplaceEvent: true },
          );
        }
      }

      await this.applyLifecycleForInbox(connection.tenantId, connection.id, externalOrderId, inbox.topic);

      await this.markInboxProcessed(inbox.id);
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
      if (this.isNativeFood99LifecycleTopic(record.provider, record.lastExternalEventTopic)) {
        await this.applyLifecycleForInbox(
          tenantId,
          record.connectionId,
          record.externalOrderId,
          record.lastExternalEventTopic,
        );
        return { success: true, skipped: true, reason: 'already_imported_lifecycle_reapplied', internalOrderId: record.internalOrderId };
      }
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

  async reapplyProcessedLifecycleEvent(eventInboxId: string, tenantId?: string): Promise<{ reapplied: boolean; reason: string }> {
    const inbox = await this.prisma.marketplaceEventInbox.findFirst({
      where: { id: eventInboxId, ...(tenantId ? { tenantId } : {}) },
      select: {
        provider: true,
        connectionId: true,
        tenantId: true,
        externalOrderId: true,
        topic: true,
      },
    });
    if (!inbox) throw new BadRequestException('Marketplace event inbox not found.');
    if (!inbox.connectionId || !inbox.tenantId || !inbox.externalOrderId
      || !this.isNativeFood99LifecycleTopic(inbox.provider, inbox.topic)) {
      return { reapplied: false, reason: 'not_replayable_lifecycle_event' };
    }
    await this.applyLifecycleForInbox(inbox.tenantId, inbox.connectionId, inbox.externalOrderId, inbox.topic);
    return { reapplied: true, reason: 'lifecycle_reapplied' };
  }

  private async applyLifecycleForInbox(
    tenantId: string,
    connectionId: string,
    externalOrderId: string,
    topic?: string | null,
  ): Promise<void> {
    await this.statusSyncService.reconcileExternalEvent({ tenantId, connectionId, externalOrderId, topic });
    await this.applyExternalLifecycleEvent(tenantId, connectionId, externalOrderId, topic);
  }

  private async markInboxProcessed(inboxId: string): Promise<void> {
    await this.prisma.marketplaceEventInbox.update({
      where: { id: inboxId },
      data: {
        status: MarketplaceEventStatus.PROCESSED,
        processedAt: new Date(),
        processingStartedAt: null,
        lastError: null,
      },
    });
  }

  private isNativeFood99LifecycleTopic(provider: MarketplaceProvider, topic?: string | null): boolean {
    if (provider !== MarketplaceProvider.FOOD_99) return false;
    return ['ORDERCONFIRM', 'ORDERREADY', 'ORDERCANCEL', 'ORDERFINISH'].includes(topic?.trim().toUpperCase() ?? '');
  }

  private async upsertMarketplaceOrder(
    tenantId: string,
    connectionId: string,
    normalized: NormalizedMarketplaceOrder,
    event: { id?: string | null; createdAt?: Date | null; sequence?: bigint | null; topic?: string | null },
  ) {
    const existing = await this.prisma.marketplaceOrder.findFirst({
      where: {
        connectionId,
        provider: normalized.provider,
        externalOrderId: normalized.externalOrderId,
      },
    });

    if (existing) {
      return this.prisma.marketplaceOrder.update({
        where: { id: existing.id },
        data: {
          externalDisplayId: normalized.externalDisplayId ?? null,
          statusExternal: normalized.externalStatus ?? null,
          externalCreatedAt: normalized.externalCreatedAt ?? existing.externalCreatedAt,
          preparationStartAt: normalized.preparationStartAt ?? existing.preparationStartAt,
          confirmationDeadlineAt: normalized.confirmationDeadlineAt ?? existing.confirmationDeadlineAt,
          lastExternalEventAt: event.createdAt ?? existing.lastExternalEventAt,
          lastExternalEventId: event.id ?? existing.lastExternalEventId,
          lastExternalEventSequence: event.sequence ?? existing.lastExternalEventSequence,
          lastExternalEventTopic: event.topic ?? existing.lastExternalEventTopic,
          rawPayload: this.toInputJsonValue(normalized.rawPayload),
          normalizedPayload: this.toInputJsonValue(normalized),
          deliveryOwnership: normalized.deliveryOwnership,
          lastSyncedAt: new Date(),
        },
      });
    }

    return this.prisma.marketplaceOrder.create({
      data: {
        tenantId,
        connectionId,
        provider: normalized.provider,
        externalOrderId: normalized.externalOrderId,
        externalDisplayId: normalized.externalDisplayId ?? null,
        statusExternal: normalized.externalStatus ?? null,
        statusInternal: this.resolveInitialStatusValue(connectionId, normalized),
        externalCreatedAt: normalized.externalCreatedAt ?? null,
        preparationStartAt: normalized.preparationStartAt ?? null,
        confirmationDeadlineAt: normalized.confirmationDeadlineAt ?? null,
        lastExternalEventAt: event.createdAt ?? null,
        lastExternalEventId: event.id ?? null,
        lastExternalEventSequence: event.sequence ?? null,
        lastExternalEventTopic: event.topic ?? null,
        rawPayload: this.toInputJsonValue(normalized.rawPayload),
        normalizedPayload: this.toInputJsonValue(normalized),
        deliveryOwnership: normalized.deliveryOwnership,
      },
    });
  }

  private isOlderEvent(
    incoming: { eventCreatedAt: Date | null; eventSequence: bigint | null; topic: string | null },
    current: { lastExternalEventAt: Date | null; lastExternalEventSequence: bigint | null; lastExternalEventTopic: string | null },
  ): boolean {
    if (!incoming.eventCreatedAt || !current.lastExternalEventAt) return false;
    const timeDifference = incoming.eventCreatedAt.getTime() - current.lastExternalEventAt.getTime();
    if (timeDifference !== 0) return timeDifference < 0;
    if (incoming.eventSequence !== null && current.lastExternalEventSequence !== null
      && incoming.eventSequence !== current.lastExternalEventSequence) {
      return incoming.eventSequence < current.lastExternalEventSequence;
    }
    return this.eventPrecedence(incoming.topic) < this.eventPrecedence(current.lastExternalEventTopic);
  }

  private eventPrecedence(topic: string | null): number {
    const normalized = topic?.toUpperCase() ?? '';
    if (normalized === 'CAN') return 70;
    if (normalized === 'CON') return 60;
    if (normalized === 'DSP') return 50;
    if (normalized === 'RTP') return 40;
    if (normalized === 'SPS' || normalized === 'SPE') return 30;
    if (normalized === 'CFM') return 20;
    if (normalized === 'PLC') return 10;
    if (normalized.includes('CANCEL')) return 70;
    if (normalized === 'ORDERCANCEL') return 70;
    if (normalized === 'ORDERFINISH') return 60;
    if (normalized === 'ORDERREADY') return 40;
    if (normalized === 'ORDERCONFIRM') return 20;
    if (normalized.includes('CONCLUD') || normalized.includes('COMPLET')) return 60;
    if (normalized.includes('DISPATCH')) return 50;
    if (normalized.includes('READY')) return 40;
    if (normalized.includes('PREPAR')) return 30;
    if (normalized.includes('CONFIRM')) return 20;
    if (normalized.includes('PLACED')) return 10;
    return 0;
  }

  private async createInternalOrderFromNormalized(normalized: NormalizedMarketplaceOrder): Promise<string> {
    const tenantId = normalized.connection.tenantId;
    const idempotencyKey = buildMarketplaceOrderIdempotencyKey(
      normalized.connection.id,
      normalized.externalOrderId,
      normalized.provider,
    );
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

    const itemsSubtotal = normalized.itemsSubtotal
      ?? normalized.items.reduce((sum, item) => sum + item.totalPrice, 0);
    const sourceChannel = normalized.provider === MarketplaceProvider.FOOD_99
      ? 'marketplace_99food'
      : 'marketplace_ifood';
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
          discountTotal: normalized.discountTotal ?? 0,
          deliveryFee: normalized.deliveryFee ?? 0,
          normalDeliveryFee: normalized.deliveryFee ?? 0,
          serviceFee: normalized.serviceFee ?? 0,
          total: normalized.total ?? itemsSubtotal,
          sourceChannel,
          idempotencyKey,
          notes: normalized.notes ?? null,
          customerId,
          paymentMethod: (normalized.paymentMethod ?? PaymentMethod.other) as PaymentMethod,
          changeFor: normalized.changeFor,
          scheduledFor: normalized.scheduledFor,
          isScheduled: Boolean(normalized.scheduledFor),
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
            snapshotComposition: item.options?.length
              ? item.options.map((option) => `+ ${option.quantity}x ${option.name}`).join('\n')
              : undefined,
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
          note: `Pedido importado via ${sourceChannel} (${normalized.externalOrderId}).`,
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
        processingStartedAt: null,
        lastError: message,
      },
    });
  }

  private async applyExternalLifecycleEvent(
    tenantId: string,
    connectionId: string,
    externalOrderId: string,
    topic?: string | null,
  ): Promise<void> {
    const normalizedTopic = topic?.trim().toUpperCase();
    const lifecycleKind = normalizedTopic === 'CONFIRMED' || normalizedTopic === 'ORDER_CONFIRMED' || normalizedTopic === 'ORDERCONFIRM'
      ? 'confirmed'
      : normalizedTopic === 'READY_FOR_PICKUP' || normalizedTopic === 'READY_TO_PICKUP' || normalizedTopic === 'ORDERREADY'
        ? 'ready'
        : normalizedTopic === 'DISPATCHED'
          ? 'dispatched'
      : normalizedTopic === 'CANCELLED' || normalizedTopic === 'ORDER_CANCELLED' || normalizedTopic === 'ORDERCANCEL'
        ? OrderStatus.cancelled
      : normalizedTopic === 'COMPLETED' || normalizedTopic === 'ORDER_COMPLETED'
          || normalizedTopic === 'CONCLUDED' || normalizedTopic === 'DELIVERED' || normalizedTopic === 'ORDERFINISH'
          ? 'completed'
          : null;
    if (!lifecycleKind) return;

    const marketplaceOrder = await this.prisma.marketplaceOrder.findFirst({
      where: { tenantId, connectionId, externalOrderId },
      select: { id: true, internalOrderId: true, provider: true },
    });
    if (!marketplaceOrder?.internalOrderId) return;
    const order = await this.prisma.order.findFirst({
      where: { id: marketplaceOrder.internalOrderId, tenantId },
      select: { status: true, fulfillmentType: true },
    });
    if (!order) return;
    const targetStatus = lifecycleKind === 'confirmed'
      ? OrderStatus.confirmed
      : lifecycleKind === 'ready'
        ? order.fulfillmentType === 'pickup' ? OrderStatus.ready_for_pickup : OrderStatus.ready_for_delivery
        : lifecycleKind === 'dispatched'
          ? OrderStatus.out_for_delivery
          : lifecycleKind === 'completed'
            ? OrderStatus.completed
            : OrderStatus.cancelled;
    const pendingCancel = targetStatus === OrderStatus.confirmed
      ? await this.prisma.marketplaceOperation.findFirst({
          where: {
            tenantId,
            marketplaceOrderId: marketplaceOrder.id,
            operation: MarketplaceOperationType.CANCEL,
            status: {
              in: [
                MarketplaceOperationStatus.PENDING,
                MarketplaceOperationStatus.QUEUED,
                MarketplaceOperationStatus.PROCESSING,
                MarketplaceOperationStatus.ACCEPTED,
              ],
            },
          },
        })
      : null;
    if (pendingCancel) {
      await this.divergenceService.record({
        tenantId,
        marketplaceOrderId: marketplaceOrder.id,
        internalOrderId: marketplaceOrder.internalOrderId,
        operationId: pendingCancel.id,
        provider: marketplaceOrder.provider,
        externalOrderId,
        type: MarketplaceDivergenceType.REMOTE_AHEAD,
        localState: order.status,
        remoteState: normalizedTopic,
        reason: 'Remote confirmation arrived while a local cancellation operation is pending.',
        recommendedAction: 'Reconcile the cancellation with the current remote order before retrying.',
        correlationId: pendingCancel.correlationId,
        lastAttemptAt: pendingCancel.lastAttemptAt,
      });
    }
    if (order.status === targetStatus) {
      await this.prisma.marketplaceOrder.updateMany({
        where: { id: marketplaceOrder.id, tenantId },
        data: { statusInternal: targetStatus, lastSyncedAt: new Date() },
      });
      return;
    }
    if (!ORDER_STATUS_TRANSITIONS[order.status]?.includes(targetStatus)) {
      await this.divergenceService.record({
        tenantId,
        marketplaceOrderId: marketplaceOrder.id,
        internalOrderId: marketplaceOrder.internalOrderId,
        provider: marketplaceOrder.provider,
        externalOrderId,
        type: MarketplaceDivergenceType.INVALID_TRANSITION,
        localState: order.status,
        remoteState: normalizedTopic,
        reason: `External event cannot apply transition ${order.status} -> ${targetStatus}.`,
        recommendedAction: 'Inspect order history and remote state; do not force a local transition.',
        correlationId: `event:${externalOrderId}:${normalizedTopic ?? 'unknown'}`,
      });
      this.logger.warn({
        message: 'marketplace_event_transition_blocked',
        tenantId,
        orderId: marketplaceOrder.internalOrderId,
        externalOrderId,
        currentStatus: order.status,
        targetStatus,
      });
      return;
    }

    await this.ordersService.updateOrderStatus(
      marketplaceOrder.internalOrderId,
      tenantId,
      { status: targetStatus, note: `Status confirmado por evento ${marketplaceOrder.provider} (${normalizedTopic}).` },
      undefined,
      { marketplaceEvent: true },
    );
    await this.prisma.marketplaceOrder.updateMany({
      where: { id: marketplaceOrder.id, tenantId },
      data: { statusInternal: targetStatus, lastSyncedAt: new Date() },
    });
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  }

  private maskExternalIdentifier(value: string | null): string | null {
    if (!value) return null;
    if (value.length <= 6) return `${value.slice(0, 2)}***`;
    return `${value.slice(0, 3)}***${value.slice(-3)}`;
  }

  private toInputJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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
