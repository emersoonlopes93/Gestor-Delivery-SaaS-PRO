/* eslint-disable @typescript-eslint/no-unused-vars */
import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import {
  MarketplaceDivergenceType,
  MarketplaceDeliveryOwnership,
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
import { NormalizedMarketplaceOrder, NormalizedMarketplaceOrderItem } from '../marketplace.types';
import { ORDER_STATUS_TRANSITIONS } from '@gestor/types';
import { MarketplaceStatusSyncService } from './marketplace-status-sync.service';
import { MarketplaceDivergenceService } from './marketplace-divergence.service';
import { buildMarketplaceOrderIdempotencyKey } from '../marketplace-idempotency';
import { MarketplaceCatalogMappingService } from './marketplace-catalog-mapping.service';
import { TheoreticalStockService } from '../../inventory/theoretical-stock.service';
import { OrderAlertsService } from '../../orders/alerts/order-alerts.service';

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
    private readonly catalogMappings: MarketplaceCatalogMappingService = {} as MarketplaceCatalogMappingService,
    private readonly theoreticalStockService: TheoreticalStockService = {} as TheoreticalStockService,
    private readonly orderAlertsService: OrderAlertsService = {} as OrderAlertsService,
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

      if (existingOrder && this.isFood99WebhookLifecycleTopic(inbox.provider, inbox.topic)) {
        await this.prisma.marketplaceOrder.updateMany({
          where: { connectionId: connection.id, provider: inbox.provider, externalOrderId },
          data: {
            lastExternalEventAt: inbox.eventCreatedAt ?? new Date(),
            lastExternalEventId: inbox.eventId,
            lastExternalEventSequence: inbox.eventSequence,
            lastExternalEventTopic: inbox.topic,
            lastSyncedAt: new Date(),
          },
        });
        await this.applyLifecycleForInbox(connection.tenantId, connection.id, externalOrderId, inbox.topic, inbox.rawPayload);
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
      const catalogResolution = await this.resolveCatalogProducts(normalizedOrder);
      this.assertCompleteFood99Snapshot(catalogResolution.order);

      const marketplaceOrder = await this.upsertMarketplaceOrder(
        connection.tenantId,
        connection.id,
        catalogResolution.order,
        {
          id: inbox.eventId,
          createdAt: inbox.eventCreatedAt,
          sequence: inbox.eventSequence,
          topic: inbox.topic,
        },
      );
      if (catalogResolution.unmappedExternalItemIds.length > 0) {
        await this.divergenceService.record({
          tenantId: connection.tenantId,
          marketplaceOrderId: marketplaceOrder.id,
          internalOrderId: marketplaceOrder.internalOrderId,
          provider: marketplaceOrder.provider,
          externalOrderId,
          type: MarketplaceDivergenceType.UNKNOWN_EXTERNAL_STATE,
          localState: marketplaceOrder.statusInternal,
          remoteState: marketplaceOrder.statusExternal,
          reason: `Marketplace catalog items are unmapped: ${catalogResolution.unmappedExternalItemIds.join(', ')}`,
          recommendedAction: 'Map each marketplace app item ID to a tenant catalog product before inventory can be depleted.',
          correlationId: inbox.correlationId,
        });
      }
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
        const internalOrderId = await this.createInternalOrderFromNormalized(catalogResolution.order);
        await this.prisma.marketplaceOrder.update({
          where: {
            connectionId_provider_externalOrderId: {
              connectionId: connection.id,
              provider: catalogResolution.order.provider,
              externalOrderId: catalogResolution.order.externalOrderId,
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
        this.ordersGateway.emitOrderChanged(connection.tenantId, internalOrderId, 'created');

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

      await this.applyLifecycleForInbox(connection.tenantId, connection.id, externalOrderId, inbox.topic, inbox.rawPayload);

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
      const repaired = record.provider === MarketplaceProvider.FOOD_99
        ? await this.repairIncompleteFood99Orders(1, tenantId, record.id)
        : 0;
      if (this.isFood99WebhookLifecycleTopic(record.provider, record.lastExternalEventTopic)) {
        await this.applyLifecycleForInbox(
          tenantId,
          record.connectionId,
          record.externalOrderId,
          record.lastExternalEventTopic,
          record.rawPayload,
        );
        return {
          success: true,
          skipped: repaired === 0,
          reason: repaired > 0 ? 'incomplete_order_repaired_and_lifecycle_reapplied' : 'already_imported_lifecycle_reapplied',
          internalOrderId: record.internalOrderId,
        };
      }
      if (repaired > 0) {
        return { success: true, skipped: false, reason: 'incomplete_order_repaired', internalOrderId: record.internalOrderId };
      }
      return { success: true, skipped: true, reason: 'already_imported', internalOrderId: record.internalOrderId };
    }

    const provider = this.providerRegistry.get(record.provider);
    const normalized = await provider.normalizeOrder({
      connection: record.connection,
      externalOrder: this.asRecord(record.rawPayload) ?? {},
    });
    const catalogResolution = await this.resolveCatalogProducts(normalized);
    const internalOrderId = await this.createInternalOrderFromNormalized(catalogResolution.order);
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
        rawPayload: true,
      },
    });
    if (!inbox) throw new BadRequestException('Marketplace event inbox not found.');
    if (!inbox.connectionId || !inbox.tenantId || !inbox.externalOrderId
      || !this.isFood99WebhookLifecycleTopic(inbox.provider, inbox.topic)) {
      return { reapplied: false, reason: 'not_replayable_lifecycle_event' };
    }
    await this.applyLifecycleForInbox(inbox.tenantId, inbox.connectionId, inbox.externalOrderId, inbox.topic, inbox.rawPayload);
    return { reapplied: true, reason: 'lifecycle_reapplied' };
  }

  /**
   * Repairs only historical 99Food lifecycle records for which a terminal
   * callback is already persisted. It deliberately does not infer a terminal
   * state from undocumented numeric detail-status values.
   */
  async reconcileStoredFood99TerminalOrders(limit = 100): Promise<number> {
    const events = await this.prisma.marketplaceEventInbox.findMany({
      where: {
        provider: MarketplaceProvider.FOOD_99,
        status: { in: [MarketplaceEventStatus.PROCESSED, MarketplaceEventStatus.FAILED] },
        topic: { in: ['orderFinish', 'ORDERFINISH', 'orderCancel', 'ORDERCANCEL'] },
        tenantId: { not: null },
        connectionId: { not: null },
        externalOrderId: { not: null },
      },
      select: {
        id: true,
        tenantId: true,
        connectionId: true,
        externalOrderId: true,
        topic: true,
        eventId: true,
        eventCreatedAt: true,
        eventSequence: true,
      },
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      take: Math.min(Math.max(limit, 1), 250),
    });

    let reconciled = 0;
    for (const event of events) {
      if (!event.tenantId || !event.connectionId || !event.externalOrderId || !this.isFood99TerminalTopic(event.topic)) continue;
      const marketplaceOrder = await this.resolveFood99MarketplaceOrder(
        event.tenantId,
        event.connectionId,
        event.externalOrderId,
      );
      if (!marketplaceOrder || marketplaceOrder.statusInternal === OrderStatus.completed
        || marketplaceOrder.statusInternal === OrderStatus.cancelled) continue;
      await this.prisma.marketplaceOrder.updateMany({
        where: { id: marketplaceOrder.id, tenantId: event.tenantId },
        data: {
          externalOrderId: event.externalOrderId,
          lastExternalEventAt: event.eventCreatedAt ?? new Date(),
          lastExternalEventId: event.eventId,
          lastExternalEventSequence: event.eventSequence,
          lastExternalEventTopic: event.topic,
          lastSyncedAt: new Date(),
        },
      });
      await this.applyLifecycleForInbox(
        event.tenantId,
        event.connectionId,
        event.externalOrderId,
        event.topic,
      );
      await this.prisma.marketplaceEventInbox.updateMany({
        where: { id: event.id },
        data: { status: MarketplaceEventStatus.PROCESSED, processedAt: new Date(), lastError: null },
      });
      reconciled += 1;
    }
    return reconciled;
  }

  /** Repairs only orders created by the former incomplete-detail fallback. */
  async repairIncompleteFood99Orders(
    limit = 100,
    tenantId?: string,
    marketplaceOrderId?: string,
  ): Promise<number> {
    const candidates = await this.prisma.marketplaceOrder.findMany({
      where: {
        provider: MarketplaceProvider.FOOD_99,
        internalOrderId: { not: null },
        internalOrder: {
          is: {
            OR: [
              { customerName: { equals: 'privacy protection', mode: 'insensitive' } },
              { customerName: { equals: 'privacy protected', mode: 'insensitive' } },
              { items: { none: {} } },
            ],
          },
        },
        ...(tenantId ? { tenantId } : {}),
        ...(marketplaceOrderId ? { id: marketplaceOrderId } : {}),
      },
      include: {
        connection: true,
        internalOrder: { select: { id: true, customerName: true, _count: { select: { items: true } } } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: Math.min(Math.max(limit, 1), 250),
    });

    let repaired = 0;
    for (const candidate of candidates) {
      const internalOrder = candidate.internalOrder;
      if (!internalOrder || (!this.isPrivacyProtectedCustomerName(internalOrder.customerName) && internalOrder._count.items > 0)) continue;
      try {
        const provider = this.providerRegistry.get(MarketplaceProvider.FOOD_99);
        const persistedPayload = this.asRecord(candidate.rawPayload) ?? {};
        let normalized = await provider.normalizeOrder({
          connection: candidate.connection,
          externalOrder: persistedPayload,
        });
        const recoverableExternalOrderId = /^\d+$/.test(candidate.externalOrderId)
          ? candidate.externalOrderId
          : normalized.externalOrderId;
        if (!this.isCompleteFood99Snapshot(normalized)) {
          if (!/^\d+$/.test(recoverableExternalOrderId)) {
            throw new Error('99Food order ID could not be recovered from the stored snapshot.');
          }
          const externalOrder = await provider.fetchOrderDetails({
            connection: candidate.connection,
            externalOrderId: recoverableExternalOrderId,
            eventPayload: persistedPayload,
          });
          normalized = await provider.normalizeOrder({ connection: candidate.connection, externalOrder });
        }
        this.assertCompleteFood99Snapshot(normalized);
        await this.replaceIncompleteFood99Order(candidate.id, internalOrder.id, normalized);
        repaired += 1;
      } catch (error) {
        this.logger.warn({
          message: 'food99_incomplete_order_repair_failed',
          marketplaceOrderId: candidate.id,
          externalOrderId: candidate.externalOrderId,
          reason: error instanceof Error ? error.message : 'Unknown error.',
        });
      }
    }
    return repaired;
  }

  private async applyLifecycleForInbox(
    tenantId: string,
    connectionId: string,
    externalOrderId: string,
    topic?: string | null,
    rawPayload?: Prisma.JsonValue,
  ): Promise<void> {
    await this.statusSyncService.reconcileExternalEvent({ tenantId, connectionId, externalOrderId, topic });
    await this.applyExternalLifecycleEvent(tenantId, connectionId, externalOrderId, topic, rawPayload);
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

  private isFood99DeliveryStatusTopic(provider: MarketplaceProvider, topic?: string | null): boolean {
    return provider === MarketplaceProvider.FOOD_99 && topic?.trim().toUpperCase() === 'DELIVERYSTATUS';
  }

  private isFood99WebhookLifecycleTopic(provider: MarketplaceProvider, topic?: string | null): boolean {
    return this.isNativeFood99LifecycleTopic(provider, topic) || this.isFood99DeliveryStatusTopic(provider, topic);
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
            snapshotComposition: this.marketplaceSnapshotComposition(item),
          },
        });
      }

      await this.theoreticalStockService.processOrderDepletionInTransaction(tx, tenantId, created.id);

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

  private async resolveCatalogProducts(normalized: NormalizedMarketplaceOrder): Promise<{
    order: NormalizedMarketplaceOrder;
    unmappedExternalItemIds: string[];
  }> {
    const externalItemIds = normalized.items
      .map((item) => item.externalItemId?.trim() ?? '')
      .filter(Boolean);
    const productIds = await this.catalogMappings.resolveProducts(
      normalized.connection.tenantId,
      normalized.connection.id,
      normalized.provider,
      externalItemIds,
    );
    const unmappedExternalItemIds: string[] = [];
    const items = normalized.items.map((item) => {
      const externalItemId = item.externalItemId?.trim() ?? '';
      const productId = externalItemId ? productIds.get(externalItemId) ?? null : null;
      if (externalItemId && !productId) unmappedExternalItemIds.push(externalItemId);
      return { ...item, productId };
    });
    return { order: { ...normalized, items }, unmappedExternalItemIds };
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
    rawPayload?: Prisma.JsonValue,
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
    if (this.isFood99DeliveryStatusTopic(marketplaceOrder.provider, topic) && rawPayload) {
      await this.applyFood99DeliveryStatus(tenantId, connectionId, externalOrderId, rawPayload);
      return;
    }
    const order = await this.prisma.order.findFirst({
      where: { id: marketplaceOrder.internalOrderId, tenantId },
      select: { status: true, fulfillmentType: true },
    });
    if (!order) return;
    if (marketplaceOrder.provider === MarketplaceProvider.FOOD_99) {
      await this.reconcileFood99Lifecycle({
        tenantId,
        marketplaceOrderId: marketplaceOrder.id,
        internalOrderId: marketplaceOrder.internalOrderId,
        externalOrderId,
        topic: normalizedTopic,
        currentStatus: order.status,
        fulfillmentType: order.fulfillmentType,
      });
      return;
    }
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

  private async applyFood99DeliveryStatus(
    tenantId: string,
    connectionId: string,
    externalOrderId: string,
    rawPayload: Prisma.JsonValue,
  ): Promise<void> {
    const data = this.asRecord(rawPayload)?.data;
    const delivery = this.asRecord(data);
    const deliveryStatus = this.readRecordString(delivery, ['delivery_status']);
    if (!deliveryStatus || !['120', '130', '140', '150', '160', '170', '180'].includes(deliveryStatus)) return;

    const marketplaceOrder = await this.prisma.marketplaceOrder.findFirst({
      where: { tenantId, connectionId, provider: MarketplaceProvider.FOOD_99, externalOrderId },
      select: {
        id: true,
        internalOrderId: true,
        deliveryOwnership: true,
        normalizedPayload: true,
      },
    });
    if (!marketplaceOrder?.internalOrderId) return;

    const order = await this.prisma.order.findFirst({
      where: { id: marketplaceOrder.internalOrderId, tenantId },
      select: { status: true, fulfillmentType: true },
    });
    if (!order) return;

    const previousPayload = this.asRecord(marketplaceOrder.normalizedPayload) ?? {};
    const previousLogistics = this.asRecord(previousPayload.logistics) ?? {};
    const logistics = {
      ...previousLogistics,
      deliveryStatus,
      riderName: this.readRecordString(delivery, ['rider_name']),
      riderPhone: this.readRecordString(delivery, ['rider_phone']),
      riderToBusinessEta: this.readRecordString(delivery, ['rider_to_B_ETA']),
      updatedAt: new Date().toISOString(),
    };
    await this.prisma.marketplaceOrder.updateMany({
      where: { id: marketplaceOrder.id, tenantId },
      data: { normalizedPayload: this.toInputJsonValue({ ...previousPayload, logistics }), lastSyncedAt: new Date() },
    });

    if (order.status === OrderStatus.completed || order.status === OrderStatus.cancelled) {
      await this.orderAlertsService.refreshTenant(tenantId);
      return;
    }

    if (deliveryStatus === '140' && marketplaceOrder.deliveryOwnership === MarketplaceDeliveryOwnership.PROVIDER) {
      await this.reconcileFood99AuthoritativeStatus({
        tenantId,
        marketplaceOrderId: marketplaceOrder.id,
        internalOrderId: marketplaceOrder.internalOrderId,
        externalOrderId,
        topic: 'DELIVERYSTATUS:140',
        currentStatus: order.status,
        fulfillmentType: order.fulfillmentType,
      }, OrderStatus.out_for_delivery, '99Food confirmou retirada pelo entregador parceiro.');
    } else if (deliveryStatus === '160') {
      await this.reconcileFood99AuthoritativeStatus({
        tenantId,
        marketplaceOrderId: marketplaceOrder.id,
        internalOrderId: marketplaceOrder.internalOrderId,
        externalOrderId,
        topic: 'DELIVERYSTATUS:160',
        currentStatus: order.status,
        fulfillmentType: order.fulfillmentType,
      }, OrderStatus.completed, '99Food confirmou a entrega concluida.');
    } else if (deliveryStatus === '170') {
      await this.divergenceService.record({
        tenantId,
        marketplaceOrderId: marketplaceOrder.id,
        internalOrderId: marketplaceOrder.internalOrderId,
        provider: MarketplaceProvider.FOOD_99,
        externalOrderId,
        type: MarketplaceDivergenceType.UNKNOWN_EXTERNAL_STATE,
        localState: order.status,
        remoteState: 'DELIVERY_STATUS_170',
        reason: '99Food cancelou somente a entrega; o pedido comercial foi preservado para reconciliacao.',
        recommendedAction: 'Confirme a nova logistica ou resolva a entrega manualmente antes de cancelar o pedido comercial.',
        correlationId: `food99:${externalOrderId}:delivery:170`,
      });
    }

    await this.orderAlertsService.refreshTenant(tenantId);
  }

  private isFood99TerminalTopic(topic?: string | null): boolean {
    const normalized = topic?.trim().toUpperCase();
    return normalized === 'ORDERFINISH' || normalized === 'ORDERCANCEL';
  }

  private async resolveFood99MarketplaceOrder(
    tenantId: string,
    connectionId: string,
    externalOrderId: string,
  ): Promise<{ id: string; statusInternal: string | null } | null> {
    const exact = await this.prisma.marketplaceOrder.findFirst({
      where: { tenantId, connectionId, provider: MarketplaceProvider.FOOD_99, externalOrderId },
      select: { id: true, statusInternal: true },
    });
    if (exact) return exact;
    if (!/^\d+$/.test(externalOrderId) || !Number.isSafeInteger(Number(externalOrderId))) return null;

    const candidates = await this.prisma.marketplaceOrder.findMany({
      where: { tenantId, connectionId, provider: MarketplaceProvider.FOOD_99, internalOrderId: { not: null } },
      select: { id: true, externalOrderId: true, statusInternal: true },
      take: 250,
    });
    const roundedMatches = candidates.filter((candidate) => (
      /^\d+$/.test(candidate.externalOrderId)
      && Number.isSafeInteger(Number(candidate.externalOrderId))
      && Number(candidate.externalOrderId) === Number(externalOrderId)
    ));
    return roundedMatches.length === 1 ? roundedMatches[0] : null;
  }

  private assertCompleteFood99Snapshot(normalized: NormalizedMarketplaceOrder): void {
    if (normalized.provider !== MarketplaceProvider.FOOD_99) return;
    if (!this.isCompleteFood99Snapshot(normalized)) {
      throw new Error('99Food order detail is incomplete; refusing to import a placeholder order.');
    }
  }

  private isCompleteFood99Snapshot(normalized: NormalizedMarketplaceOrder): boolean {
    return normalized.externalOrderId !== 'unknown-order'
      && normalized.items.length > 0;
  }

  private isPrivacyProtectedCustomerName(value: string): boolean {
    const normalized = value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
    return normalized === 'privacy protection' || normalized === 'privacy protected';
  }

  private async replaceIncompleteFood99Order(
    marketplaceOrderId: string,
    internalOrderId: string,
    normalized: NormalizedMarketplaceOrder,
  ): Promise<void> {
    const tenantId = normalized.connection.tenantId;
    const itemsSubtotal = normalized.itemsSubtotal
      ?? normalized.items.reduce((sum, item) => sum + item.totalPrice, 0);
    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: internalOrderId },
        data: {
          customerName: normalized.customerName,
          customerPhone: normalized.customerPhone,
          customerEmail: normalized.customerEmail ?? null,
          itemsSubtotal,
          discountTotal: normalized.discountTotal ?? 0,
          deliveryFee: normalized.deliveryFee ?? 0,
          normalDeliveryFee: normalized.deliveryFee ?? 0,
          serviceFee: normalized.serviceFee ?? 0,
          total: normalized.total ?? itemsSubtotal,
          notes: normalized.notes ?? null,
          paymentMethod: (normalized.paymentMethod ?? PaymentMethod.other) as PaymentMethod,
          changeFor: normalized.changeFor,
        },
      });
      await tx.orderItem.deleteMany({ where: { orderId: internalOrderId, tenantId } });
      for (const item of normalized.items) {
        await tx.orderItem.create({
          data: {
            orderId: internalOrderId,
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
            snapshotComposition: this.marketplaceSnapshotComposition(item),
          },
        });
      }
      if (normalized.deliveryAddress) {
        await tx.orderDeliveryAddress.upsert({
          where: { orderId: internalOrderId },
          create: { orderId: internalOrderId, tenantId, ...normalized.deliveryAddress },
          update: { ...normalized.deliveryAddress },
        });
      }
      await tx.marketplaceOrder.update({
        where: { id: marketplaceOrderId },
        data: {
          externalOrderId: normalized.externalOrderId,
          externalDisplayId: normalized.externalDisplayId ?? null,
          statusExternal: normalized.externalStatus ?? null,
          rawPayload: this.toInputJsonValue(normalized.rawPayload),
          normalizedPayload: this.toInputJsonValue(normalized),
          deliveryOwnership: normalized.deliveryOwnership,
          lastSyncedAt: new Date(),
        },
      });
    });
    this.ordersGateway.emitOrderChanged(tenantId, internalOrderId, 'marketplace');
  }

  private marketplaceSnapshotComposition(item: NormalizedMarketplaceOrderItem): string | undefined {
    if (!item.options?.length) return undefined;
    return item.options
      .map((option) => `${'  '.repeat(option.hierarchyDepth ?? 0)}+ ${option.quantity}x ${option.name}`)
      .join('\n');
  }

  private async reconcileFood99Lifecycle(input: {
    tenantId: string;
    marketplaceOrderId: string;
    internalOrderId: string;
    externalOrderId: string;
    topic?: string;
    currentStatus: OrderStatus;
    fulfillmentType: string;
  }): Promise<void> {
    const topic = input.topic;
    if (!topic || !this.isNativeFood99LifecycleTopic(MarketplaceProvider.FOOD_99, topic)) return;

    if (input.currentStatus === OrderStatus.completed || input.currentStatus === OrderStatus.cancelled) {
      await this.syncFood99InternalStatus(input.tenantId, input.marketplaceOrderId, input.currentStatus);
      return;
    }

    if (topic === 'ORDERCONFIRM') {
      await this.advanceFood99OperationalOrder(input, [OrderStatus.confirmed, OrderStatus.preparing]);
      return;
    }

    const readyStatus = input.fulfillmentType === 'pickup'
      ? OrderStatus.ready_for_pickup
      : OrderStatus.ready_for_delivery;
    if (topic === 'ORDERREADY') {
      // A missed confirmation means the restaurant has already completed its
      // kitchen work. Reconcile the authoritative ready state without creating
      // a late KDS ticket. A known confirmation is still advanced through
      // preparing, which creates the one canonical KDS job.
      if (input.currentStatus === OrderStatus.pending) {
        await this.reconcileFood99AuthoritativeStatus(input, readyStatus, '99Food informou pedido pronto sem confirmação local.');
        return;
      }
      await this.advanceFood99OperationalOrder(input, [OrderStatus.preparing, readyStatus]);
      return;
    }

    if (topic === 'ORDERFINISH') {
      await this.reconcileFood99AuthoritativeStatus(input, OrderStatus.completed, '99Food confirmou a conclusão do pedido.');
      return;
    }

    if (topic === 'ORDERCANCEL') {
      await this.reconcileFood99AuthoritativeStatus(input, OrderStatus.cancelled, '99Food confirmou o cancelamento do pedido.');
    }
  }

  private async advanceFood99OperationalOrder(
    input: {
      tenantId: string;
      marketplaceOrderId: string;
      internalOrderId: string;
      externalOrderId: string;
      topic?: string;
      currentStatus: OrderStatus;
      fulfillmentType: string;
    },
    statuses: OrderStatus[],
  ): Promise<void> {
    let currentStatus = input.currentStatus;
    for (const nextStatus of statuses) {
      if (currentStatus === nextStatus) continue;
      if (currentStatus === OrderStatus.completed || currentStatus === OrderStatus.cancelled) break;
      if (!ORDER_STATUS_TRANSITIONS[currentStatus]?.includes(nextStatus)) {
        // The external source may legitimately be ahead of the PedeHub
        // operational board. Do not move an already-ready order backwards.
        break;
      }
      await this.ordersService.updateOrderStatus(
        input.internalOrderId,
        input.tenantId,
        { status: nextStatus, note: `Status operacional reconciliado pela 99Food (${input.topic}).` },
        undefined,
        { marketplaceEvent: true },
      );
      currentStatus = nextStatus;
    }
    await this.syncFood99InternalStatus(input.tenantId, input.marketplaceOrderId, currentStatus);
  }

  private async reconcileFood99AuthoritativeStatus(
    input: {
      tenantId: string;
      marketplaceOrderId: string;
      internalOrderId: string;
      externalOrderId: string;
      topic?: string;
      currentStatus: OrderStatus;
      fulfillmentType: string;
    },
    targetStatus: OrderStatus,
    note: string,
  ): Promise<void> {
    if (input.currentStatus === targetStatus) {
      await this.syncFood99InternalStatus(input.tenantId, input.marketplaceOrderId, targetStatus);
      return;
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.ordersService.applyOrderStatusTransitionInTransaction(tx, {
          tenantId: input.tenantId,
          orderId: input.internalOrderId,
          expectedCurrentStatus: input.currentStatus,
          targetStatus,
          transitionPolicy: 'food99_authoritative',
        });
        if (targetStatus === OrderStatus.cancelled) {
          await this.theoreticalStockService.reverseOrderDepletionInTransaction(tx, input.tenantId, input.internalOrderId);
        }
        await tx.orderTimeline.create({
          data: {
            tenantId: input.tenantId,
            orderId: input.internalOrderId,
            status: targetStatus,
            note,
            actorId: null,
          },
        });
        await tx.marketplaceOrder.updateMany({
          where: { id: input.marketplaceOrderId, tenantId: input.tenantId },
          data: { statusInternal: targetStatus, lastSyncedAt: new Date() },
        });
      });
    } catch (error) {
      if (this.isOrderStatusStaleError(error)) return;
      throw error;
    }
    try {
      this.ordersGateway.emitOrderChanged(input.tenantId, input.internalOrderId, 'status');
    } catch (error) {
      this.logger.error(
        `99Food lifecycle persisted but realtime notification failed for ${input.internalOrderId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private async syncFood99InternalStatus(
    tenantId: string,
    marketplaceOrderId: string,
    status: OrderStatus,
  ): Promise<void> {
    await this.prisma.marketplaceOrder.updateMany({
      where: { id: marketplaceOrderId, tenantId },
      data: { statusInternal: status, lastSyncedAt: new Date() },
    });
  }

  private isOrderStatusStaleError(error: unknown): boolean {
    if (!(error instanceof ConflictException)) return false;
    const response = error.getResponse();
    return typeof response === 'object'
      && response !== null
      && 'code' in response
      && response.code === 'ORDER_STATUS_STALE';
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
    return this.readRecordString(record, keys);
  }

  private readRecordString(record: Record<string, unknown> | null, keys: string[]): string | null {
    if (!record) return null;
    for (const key of keys) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
      if (typeof candidate === 'number' && Number.isSafeInteger(candidate)) return String(candidate);
    }
    return null;
  }
}
