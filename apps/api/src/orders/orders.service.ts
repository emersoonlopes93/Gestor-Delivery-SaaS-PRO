import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
  Inject,
  forwardRef,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { evaluateOwnFleetEligibility } from '../delivery/own-fleet-eligibility';
import { OrderStatus, Prisma, DineInTable, PaymentMethod as PrismaPaymentMethod } from '@prisma/client';
import { PaymentMethod as SharedPaymentMethod } from '@gestor/types';
import { CheckoutValidatorService } from './checkout-validator.service';
import { CustomerService } from '../crm/customer.service';
import { CashbackService } from '../promotions/cashback.service';
import { LoyaltyService } from '../promotions/loyalty.service';
import { TheoreticalStockService } from '../inventory/theoretical-stock.service';
import { PaymentGatewayService } from '../payment-gateway/payment-gateway.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { WhatsappService } from '../notifications/whatsapp.service';
import { PushService } from '../notifications/push.service';
import type {
  CreateOrderDTO,
  OrderResponseDTO,
  PixPaymentDTO,
  OrderListItemDTO,
  OrderBoardItemDTO,
  OrderKdsItemDTO,
  OrderDispatchItemDTO,
  ValidatedLine,
  EditOrderDTO,
  UpdateOrderNotesDTO,
  CreateOrderItemDTO,
  OrderLineType,
  CreateOrderItemSelectionGroupDTO,
  CreateOrderItemComboSlotSelectionDTO,
  PizzaCompositionDTO,
  OrderAutoAcceptSettings,
  DriverDeliveryEvent,
  DriverRouteEvent,
} from '@gestor/types';
import { ORDER_STATUS_TRANSITIONS, UpdateOrderStatusDTO } from '@gestor/types';
import type { FulfillmentType } from '@gestor/types';
import { generatePublicTrackingToken } from '../common/utils/tracking-token.util';
import { OrdersGateway } from './orders.gateway';
import { KdsService } from '../kds/kds.service';
import { PrintingService } from '../printing/printing.service';
import { RevenueLedgerService } from '../billing/revenue-ledger.service';
import { MarketplaceStatusSyncService } from '../marketplace/services/marketplace-status-sync.service';
import { assertOnlinePaymentEmail, normalizeReturnUrl } from './public-checkout-guards.util';
import { UpdateOrderAutoAcceptSettingsDto } from './dto/update-order-auto-accept-settings.dto';
import { canAutoAcceptOrder } from './order-auto-accept.policy';
import { runSerializableTransactionWithRetry } from '../database/serializable-transaction';
import { AuthoritativeOrderAnalyticsService } from '../analytics/authoritative-order-analytics.service';
import { DeliveryTrackingGateway } from '../delivery/delivery-tracking.gateway';
import { DeliveryRunsService } from '../delivery/delivery-runs.service';
import {
  assertOrderIdempotencyPayload,
  isPrismaUniqueConstraintError,
} from './order-idempotency.util';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger('OrdersService');

  private mapPaymentMethod(p: PrismaPaymentMethod): SharedPaymentMethod {
    const map: Record<PrismaPaymentMethod, SharedPaymentMethod> = {
      cash: SharedPaymentMethod.cash,
      credit_card: SharedPaymentMethod.credit_card,
      debit_card: SharedPaymentMethod.debit_card,
      pix: SharedPaymentMethod.pix,
      card_on_delivery: SharedPaymentMethod.card_on_delivery,
      other: SharedPaymentMethod.other,
    };
    return map[p];
  }

  private mapFulfillmentType(f: string | null): FulfillmentType {
    if (f === 'pickup' || f === 'dine_in' || f === 'table' || f === 'delivery') return f;
    return 'delivery';
  }

  private getAutoAcceptSettingsSnapshot(
    settings: {
      autoAcceptOrdersEnabled?: boolean | null;
      autoAcceptDelaySeconds?: number | null;
      autoAcceptDeliveryOrders?: boolean | null;
      autoAcceptPickupOrders?: boolean | null;
    } | null | undefined,
  ): OrderAutoAcceptSettings {
    return {
      autoAcceptOrdersEnabled: settings?.autoAcceptOrdersEnabled ?? false,
      autoAcceptDelaySeconds: (settings?.autoAcceptDelaySeconds ?? 0) as 0 | 30 | 60,
      autoAcceptDeliveryOrders: settings?.autoAcceptDeliveryOrders ?? true,
      autoAcceptPickupOrders: settings?.autoAcceptPickupOrders ?? true,
    };
  }

  async getAutoAcceptSettings(tenantId: string): Promise<OrderAutoAcceptSettings> {
    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: {
        autoAcceptOrdersEnabled: true,
        autoAcceptDelaySeconds: true,
        autoAcceptDeliveryOrders: true,
        autoAcceptPickupOrders: true,
      },
    });

    return this.getAutoAcceptSettingsSnapshot(settings);
  }

  async updateAutoAcceptSettings(
    tenantId: string,
    actorUserId: string,
    dto: UpdateOrderAutoAcceptSettingsDto,
  ): Promise<OrderAutoAcceptSettings> {
    if (dto.autoAcceptDelaySeconds && dto.autoAcceptDelaySeconds > 0) {
      throw new BadRequestException('Nesta fase o autoaceite suporta apenas aceite imediato.');
    }

    const existing = await this.getAutoAcceptSettings(tenantId);
    const next: OrderAutoAcceptSettings = {
      autoAcceptOrdersEnabled: dto.autoAcceptOrdersEnabled ?? existing.autoAcceptOrdersEnabled,
      autoAcceptDelaySeconds: dto.autoAcceptDelaySeconds ?? existing.autoAcceptDelaySeconds,
      autoAcceptDeliveryOrders: dto.autoAcceptDeliveryOrders ?? existing.autoAcceptDeliveryOrders,
      autoAcceptPickupOrders: dto.autoAcceptPickupOrders ?? existing.autoAcceptPickupOrders,
    };
    const existingAuditSnapshot: Prisma.InputJsonObject = {
      autoAcceptOrdersEnabled: existing.autoAcceptOrdersEnabled,
      autoAcceptDelaySeconds: existing.autoAcceptDelaySeconds,
      autoAcceptDeliveryOrders: existing.autoAcceptDeliveryOrders,
      autoAcceptPickupOrders: existing.autoAcceptPickupOrders,
    };
    const nextAuditSnapshot: Prisma.InputJsonObject = {
      autoAcceptOrdersEnabled: next.autoAcceptOrdersEnabled,
      autoAcceptDelaySeconds: next.autoAcceptDelaySeconds,
      autoAcceptDeliveryOrders: next.autoAcceptDeliveryOrders,
      autoAcceptPickupOrders: next.autoAcceptPickupOrders,
    };

    await this.prisma.$transaction(async (tx) => {
      await tx.tenantSettings.upsert({
        where: { tenantId },
        create: {
          tenantId,
          ...next,
        },
        update: next,
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actorUserId,
          userType: 'tenant_user',
          action: 'tenant.order.auto_accept_config.update',
          resource: 'tenant_settings',
          details: {
            before: existingAuditSnapshot,
            after: nextAuditSnapshot,
          },
        },
      });
    });

    return next;
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly checkoutValidator: CheckoutValidatorService,
    private readonly customerService: CustomerService,
    private readonly cashbackService: CashbackService,
    private readonly loyaltyService: LoyaltyService,
    private readonly inventoryService: TheoreticalStockService,
    private readonly paymentGatewayService: PaymentGatewayService,
    private readonly schedulingService: SchedulingService,
    @Inject(forwardRef(() => WhatsappService))
    private readonly whatsappService: WhatsappService,
    private readonly ordersGateway: OrdersGateway,
    private readonly kdsService: KdsService,
    private readonly printingService: PrintingService,
    private readonly revenueLedgerService: RevenueLedgerService,
    @Inject(forwardRef(() => MarketplaceStatusSyncService))
    private readonly marketplaceStatusSyncService: MarketplaceStatusSyncService,
    private readonly pushService: PushService,
    @Optional() private readonly authoritativeOrderAnalyticsService?: AuthoritativeOrderAnalyticsService,
    @Optional() @Inject(forwardRef(() => DeliveryTrackingGateway))
    private readonly deliveryTrackingGateway?: DeliveryTrackingGateway,
    @Optional() @Inject(forwardRef(() => DeliveryRunsService))
    private readonly deliveryRunsService?: DeliveryRunsService,
  ) {}

  async createOrder(slug: string, dto: CreateOrderDTO): Promise<OrderResponseDTO> {
    assertOrderIdempotencyPayload(dto);

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      include: { settings: true },
    });
    if (!tenant) throw new NotFoundException('Loja não encontrada.');

    // Resolve or sync customer
    let customerId: string | null = null;
    if (dto.customerPhone) {
      const cust = await this.customerService.syncCustomerOnOrderUpsert(
        tenant.id,
        dto.customerPhone,
        dto.customerName,
        dto.customerEmail
      );
      if (cust) customerId = cust.id;
    }

    let dineInTable: DineInTable | null = null;
    if (dto.tableId) {
      dineInTable = await this.prisma.dineInTable.findFirst({
        where: { id: dto.tableId, tenantId: tenant.id },
      });
      if (!dineInTable) {
        throw new NotFoundException('Mesa não encontrada.');
      }
    }

    // 1. Validate everything server-side
    // Resolve channel: whatsapp_ai orders use the whatsapp_ai channel to bypass sellableOnline check
    const validatorChannel: 'storefront_delivery' | 'storefront_pickup' | 'whatsapp_ai' =
      dto.sourceChannel === 'whatsapp_ai'
        ? 'whatsapp_ai'
        : dto.fulfillmentType === 'delivery'
          ? 'storefront_delivery'
          : 'storefront_pickup';

    const validation = await this.checkoutValidator.validate(slug, dto.items, {
      customerId,
      couponCode: dto.couponCode,
      useCashbackAmount: dto.useCashbackAmount,
      deliveryAddress: dto.deliveryAddress,
      payment: dto.payment,
      channel: validatorChannel,
      scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : undefined,
      timeSlotId: dto.timeSlotId,
    });
    const {
      tenantId,
      lines,
      itemsSubtotal,
      discountTotal,
      deliveryFee,
      total,
      couponId,
      cashbackUsed,
      resolvedDeliveryCoordinates,
    } = validation;

    this.logger.debug(
      `createOrder: fulfillmentType=${dto.fulfillmentType} hasAddress=${!!dto.deliveryAddress} channel=${validatorChannel}`,
    );

    // 2. Check delivery address required for delivery (except whatsapp_ai which already validated above)
    if (dto.fulfillmentType === 'delivery' && !dto.deliveryAddress && dto.sourceChannel !== 'whatsapp_ai') {
      throw new BadRequestException('Endereço de entrega é obrigatório para pedidos de entrega.');
    }

    // 3. Idempotency check
    const existingOrder = await this.prisma.order.findUnique({
      where: {
        tenantId_idempotencyKey: { tenantId, idempotencyKey: dto.idempotencyKey },
      },
    });

    if (existingOrder) {
      // Return existing order (idempotent)
      return this.getOrderDetail(existingOrder.id, tenantId);
    }

    assertOnlinePaymentEmail(dto.payment.method, dto.customerEmail);

    // 4. Transactional order creation
    const finalTotal = total; 

    let order: Prisma.OrderGetPayload<Record<string, never>>;
    try {
      order = await runSerializableTransactionWithRetry(
        this.prisma,
        async (tx) => {
        // Atomic increment of order sequence
        const updatedTenant = await tx.tenant.update({
          where: { id: tenantId },
          data: { orderSequence: { increment: 1 } },
          select: { orderSequence: true },
        });

        const orderNumber = `#${updatedTenant.orderSequence.toString().padStart(4, '0')}`;

        const newOrder = await tx.order.create({
          data: {
            tenantId,
            orderNumber,
            status: 'pending',
            fulfillmentType: dto.fulfillmentType,
            customerName: dto.customerName,
            customerPhone: dto.customerPhone,
            customerEmail: dto.customerEmail || null,
            itemsSubtotal,
            discountTotal: discountTotal || 0,
            deliveryFee,
            normalDeliveryFee: deliveryFee,
            serviceFee: 0,
            total: finalTotal,
            sourceChannel: dto.sourceChannel || 'direct_online',
            idempotencyKey: dto.idempotencyKey,
            notes: dto.notes || null,
            customerId,
            couponId,
            cashbackUsed,
            paymentMethod: dto.payment.method as PrismaPaymentMethod,
            changeFor: dto.payment.changeFor || null,
            scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : undefined,
            isScheduled: dto.scheduledFor && dto.timeSlotId ? true : false,
            publicTrackingToken: generatePublicTrackingToken(),
            tableNumber: dineInTable?.name || null,
            tableId: dineInTable?.id || null,
          },
        });

        // Create order items
        for (const line of lines) {
          const snapshotCatalogV2Json = (line as ValidatedLine & { snapshotCatalogV2Json?: unknown })
            .snapshotCatalogV2Json as Prisma.InputJsonValue | undefined;

          const sourceUpsellId = (line as ValidatedLine & { sourceUpsellId?: string }).sourceUpsellId || null;

          await tx.orderItem.create({
            data: {
              orderId: newOrder.id,
              tenantId,
              lineType: line.lineType,
              productId: line.lineType === 'product' ? (line as ValidatedLine & { productId: string }).productId : null,
              comboId: line.lineType === 'combo' ? (line as ValidatedLine & { comboId: string }).comboId : null,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              lineTotal: line.lineTotal,
              notes: line.notes || null,
              snapshotName: line.name,
              snapshotImage: line.image,
              snapshotBasePrice: line.basePrice,
              snapshotExtrasTotal: line.extrasTotal,
              snapshotComposition: line.composition || null,
              snapshotCatalogV2Json,
              sourceUpsellId,
            },
          });


        }

        // Delivery address
    if (dto.fulfillmentType === 'delivery' && dto.deliveryAddress) {
      await tx.orderDeliveryAddress.create({
        data: {
              orderId: newOrder.id,
              tenantId,
              street: dto.deliveryAddress.street,
              number: dto.deliveryAddress.number,
              complement: dto.deliveryAddress.complement || null,
              neighborhood: dto.deliveryAddress.neighborhood,
              city: dto.deliveryAddress.city,
              state: dto.deliveryAddress.state,
              zipCode: dto.deliveryAddress.zipCode,
              reference: dto.deliveryAddress.reference || null,
              lat: dto.deliveryAddress.lat ?? resolvedDeliveryCoordinates?.lat ?? null,
              lng: dto.deliveryAddress.lng ?? resolvedDeliveryCoordinates?.lng ?? null,
            },
          });
        }

        // Timeline entry
        await tx.orderTimeline.create({
          data: {
            orderId: newOrder.id,
            tenantId,
            status: 'pending',
            note: `Pedido recebido via ${dto.sourceChannel || 'direct_online'}.`,
          },
        });

        // Update DineInTable
        if (dineInTable) {
          const claimedTable = await tx.dineInTable.updateMany({
            where: {
              id: dineInTable.id,
              tenantId,
              OR: [
                { status: 'free', activeOrderId: null },
                { activeOrderId: newOrder.id },
              ],
            },
            data: {
              activeOrderId: newOrder.id,
              status: 'occupied',
            },
          });
          if (claimedTable.count !== 1) {
            throw new ConflictException(`A mesa ${dineInTable.name} já está ocupada por outro atendimento ativo.`);
          }
        }

        if (dto.scheduledFor && dto.timeSlotId) {
          if (!customerId) {
            throw new BadRequestException('Cliente identificado é obrigatório para agendamento.');
          }
          await this.schedulingService.reserveScheduledOrderInTransaction(tx, {
            tenantId,
            orderId: newOrder.id,
            customerId,
            fulfillmentType: dto.fulfillmentType,
            scheduledFor: new Date(dto.scheduledFor),
            timeSlotId: dto.timeSlotId,
            estimatedDuration: dto.estimatedDuration || 30,
            notes: `Agendado para pedido ${newOrder.orderNumber}`,
          });
        }

        await this.inventoryService.processOrderDepletionInTransaction(tx, tenantId, newOrder.id);

        if (cashbackUsed && customerId) {
          await this.cashbackService.createTransaction({
            tenantId,
            customerId,
            type: 'used',
            amount: cashbackUsed,
            orderId: newOrder.id,
            description: `Usado no pedido ${newOrder.orderNumber}`,
          }, tx);
        }

        if (couponId) {
          await tx.coupon.update({
            where: { id: couponId },
            data: { usedCount: { increment: 1 } },
          });
        }

        return newOrder;
        },
        {
          timeout: 20_000,
          maxWait: 5_000,
          onRetry: (attempt, delayMs) => this.logger.warn(
            `Retrying public checkout transaction after P2034 (attempt ${attempt + 1}/3, backoff ${delayMs}ms)`,
          ),
        },
      );
    } catch (error: unknown) {
      if (isPrismaUniqueConstraintError(error)) {
        const concurrentOrder = await this.prisma.order.findUnique({
          where: {
            tenantId_idempotencyKey: { tenantId, idempotencyKey: dto.idempotencyKey },
          },
        });
        if (concurrentOrder) {
          return this.getOrderDetail(concurrentOrder.id, tenantId);
        }
      }
      throw error;
    }

    let orderDetail = await this.getOrderDetail(order.id, tenantId);

    if (customerId && dto.fulfillmentType === 'delivery' && dto.deliveryAddress) {
      await this.customerService.saveDeliveryAddressFromOrder(tenantId, customerId, {
        street: dto.deliveryAddress.street,
        number: dto.deliveryAddress.number,
        complement: dto.deliveryAddress.complement || null,
        neighborhood: dto.deliveryAddress.neighborhood,
        city: dto.deliveryAddress.city,
        state: dto.deliveryAddress.state,
        zipCode: dto.deliveryAddress.zipCode,
        reference: dto.deliveryAddress.reference || null,
        lat: dto.deliveryAddress.lat ?? resolvedDeliveryCoordinates?.lat ?? null,
        lng: dto.deliveryAddress.lng ?? resolvedDeliveryCoordinates?.lng ?? null,
      }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unknown address sync error';
        this.logger.warn(`Failed to sync customer address from order ${order.id}: ${message}`);
      });
    }
    
    const autoAcceptSettings = this.getAutoAcceptSettingsSnapshot(tenant.settings);
    const autoAcceptDecision = canAutoAcceptOrder({
      id: order.id,
      status: order.status,
      fulfillmentType: dto.fulfillmentType,
      sourceChannel: order.sourceChannel,
      paymentMethod: order.paymentMethod,
    }, autoAcceptSettings, {
      tenantStatus: tenant.status,
      storePaused: tenant.settings?.isStorePaused ?? false,
    });

    if (autoAcceptDecision.allowed) {
      await this.updateOrderStatus(order.id, tenantId, {
        status: 'confirmed',
        note: 'Pedido aceito automaticamente pelo sistema.',
      });

      await this.prisma.auditLog.create({
        data: {
          tenantId,
          userType: 'system',
          action: 'order.auto_accepted',
          resource: 'order',
          details: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            reason: 'eligible_storefront_auto_accept',
          },
        },
      });

      orderDetail = await this.getOrderDetail(order.id, tenantId);
      this.ordersGateway.emitOrderAutoAccepted(tenantId, {
        orderId: order.id,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        total: order.total.toString(),
      });
    } else {
      // Emitir via Socket para o painel administrativo (tempo real)
      this.ordersGateway.emitNewOrder(tenantId, {
        ...orderDetail,
        itemCount: orderDetail.items.length,
      });
    }
    
    // Se pagamento for PIX, gerar QR code
    if (dto.payment.method === 'pix') {
      try {
        const pixPayment = await this.paymentGatewayService.createPixPayment(
          order.id,
          dto.customerEmail!,
          dto.customerName
        );
        
        return Object.assign(orderDetail, { pixPayment }) as OrderResponseDTO;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Error creating PIX payment: ${message}`);
        // Não falhar o pedido, apenas logar erro
      }
    } else if (dto.payment.method === 'credit_card' || dto.payment.method === 'debit_card') {
      try {
        const preferencePayment = await this.paymentGatewayService.createPreferencePayment(
          order.id,
          dto.customerEmail!,
          dto.customerName,
          normalizeReturnUrl(dto.returnUrl),
          dto.payment.method
        );

        return Object.assign(orderDetail, { preferencePayment }) as OrderResponseDTO;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Error creating Preference/Card payment: ${message}`);
        // Não falhar o pedido, logar erro
      }
    }

    return orderDetail;
  }

  async validateCheckout(slug: string, dto: CreateOrderDTO) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug }
    });
    if (!tenant) throw new NotFoundException('Loja não encontrada.');

    let customerId: string | null = null;
    if (dto.customerPhone) {
      const cust = await this.prisma.customer.findFirst({
        where: { tenantId: tenant.id, phone: dto.customerPhone }
      });
      if (cust) customerId = cust.id;
    }

    const validation = await this.checkoutValidator.validate(slug, dto.items, {
      customerId,
      couponCode: dto.couponCode,
      useCashbackAmount: dto.useCashbackAmount,
      deliveryAddress: dto.deliveryAddress,
      payment: dto.payment,
      channel: dto.fulfillmentType === 'delivery' ? 'storefront_delivery' : 'storefront_pickup',
      scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : undefined,
      timeSlotId: dto.timeSlotId,
    });

    return validation;
  }

  async listOrders(
    tenantId: string,
    page = 1,
    limit = 20,
    status?: OrderStatus,
    channel?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<{ items: OrderListItemDTO[]; total: number }> {
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      tenantId,
      ...(status ? { status } : {}),
      ...(channel ? { sourceChannel: channel } : {}),
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate ? { gte: new Date(startDate) } : {}),
              ...(endDate ? { lte: new Date(endDate) } : {}),
            },
          }
        : {}),
    };

    try {
      const [items, total] = await Promise.all([
        this.prisma.order.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            _count: { select: { items: true } },
          },
        }),
        this.prisma.order.count({ where }),
      ]);

      return {
        items: items.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status as OrderStatus,
          fulfillmentType: this.mapFulfillmentType(o.fulfillmentType),
          customerName: o.customerName,
          customerPhone: o.customerPhone,
          total: Number(o.total),
          itemCount: o._count.items,
          paymentMethod: this.mapPaymentMethod(o.paymentMethod),
          scheduledFor: o.scheduledFor ? o.scheduledFor.toISOString() : null,
          isScheduled: o.isScheduled ?? false,
          sourceChannel: o.sourceChannel,
          createdAt: o.createdAt.toISOString(),
        })),
        total,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error in listOrders: ${message}`);
      throw error;
    }
  }

  async getAdminOrders(
    tenantId: string,
    page: number = 1,
    limit: number = 20,
    filters?: {
      status?: OrderStatus;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<{ items: OrderListItemDTO[]; total: number }> {
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      tenantId,
    };

    if (filters?.status) where.status = filters.status;
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {
        gte: filters.startDate ? new Date(filters.startDate) : undefined,
        lte: filters.endDate ? new Date(filters.endDate) : undefined,
      };
    }

    try {
      const [items, total] = await Promise.all([
        this.prisma.order.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            _count: {
              select: { items: true },
            },
          },
        }),
        this.prisma.order.count({ where }),
      ]);

      return {
        items: items.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status as OrderStatus,
          fulfillmentType: this.mapFulfillmentType(o.fulfillmentType),
          customerName: o.customerName,
          customerPhone: o.customerPhone,
          total: Number(o.total),
          itemCount: o._count.items,
          paymentMethod: this.mapPaymentMethod(o.paymentMethod),
          scheduledFor: o.scheduledFor ? o.scheduledFor.toISOString() : null,
          isScheduled: o.isScheduled ?? false,
          sourceChannel: o.sourceChannel,
          createdAt: o.createdAt.toISOString(),
        })),
        total,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error in getAdminOrders: ${message}`);
      throw error;
    }
  }

  async listCustomerOrders(
    tenantId: string,
    customerId: string,
    page = 1,
    limit = 20,
  ): Promise<{ items: OrderListItemDTO[]; total: number }> {
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      tenantId,
      customerId,
    };

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { items: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      items: items.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status as OrderStatus,
        fulfillmentType: this.mapFulfillmentType(o.fulfillmentType),
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        total: Number(o.total),
        itemCount: o._count.items,
        paymentMethod: this.mapPaymentMethod(o.paymentMethod),
        scheduledFor: o.scheduledFor ? o.scheduledFor.toISOString() : null,
        isScheduled: o.isScheduled ?? false,
        sourceChannel: o.sourceChannel,
        publicTrackingToken: o.publicTrackingToken,
        createdAt: o.createdAt.toISOString(),
      })),
      total,
    };
  }

  async getBoardOrders(tenantId: string, fulfillmentType?: 'delivery' | 'pickup'): Promise<OrderBoardItemDTO[]> {
    const activeStatuses: OrderStatus[] = [
      'pending',
      'confirmed',
      'preparing',
      'ready_for_pickup',
      'ready_for_delivery',
      'out_for_delivery',
    ];

    const orders = await this.prisma.order.findMany({
      where: {
        tenantId,
        status: { in: activeStatuses },
        ...(fulfillmentType ? { fulfillmentType } : {}),
      },
      include: {
        items: true,
        deliveryDriver: true,
        table: { select: { id: true, name: true } },
        marketplaceOrders: { select: { provider: true, deliveryOwnership: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status as OrderStatus,
      fulfillmentType: this.mapFulfillmentType(o.fulfillmentType),
      customerName: o.customerName,
      total: Number(o.total),
      itemsSubtotal: Number(o.itemsSubtotal),
      itemCount: o.items.reduce((sum, i) => sum + i.quantity, 0),
      itemsSummary: o.items.map((i) => `${i.quantity}x ${i.snapshotName}`).join(', '),
      sourceChannel: o.sourceChannel,
      scheduledFor: o.scheduledFor ? o.scheduledFor.toISOString() : null,
      isScheduled: o.isScheduled ?? false,
      marketplaceCapabilities: this.getMarketplaceCapabilities(o.marketplaceOrders),
      createdAt: o.createdAt.toISOString(),
      notes: o.notes,
      deliveryDriverId: o.deliveryDriverId || undefined,
      deliveryDriverName: o.deliveryDriver?.name || undefined,
      deliveryDriverStatus: o.deliveryDriver?.status || undefined,
    }));
  }

  private getMarketplaceCapabilities(marketplaceOrders: Array<{ provider: string; deliveryOwnership: string }>) {
    const marketplaceOrder = marketplaceOrders[0];
    if (!marketplaceOrder) return null;
    if (marketplaceOrder.provider === 'FOOD_99') {
      return {
        canConfirm: true,
        canMarkReady: true,
        canDelivered: marketplaceOrder.deliveryOwnership === 'MERCHANT',
        canCancel: false,
        canSync: true,
        unavailableMessage: 'Confirme este pedido pela 99Food.',
      };
    }
    return {
      canConfirm: true,
      canMarkReady: true,
      canDelivered: true,
      canCancel: true,
      canSync: true,
      unavailableMessage: null,
    };
  }

  async getKdsOrders(tenantId: string): Promise<OrderKdsItemDTO[]> {
    const kdsStatuses: OrderStatus[] = ['confirmed', 'preparing'];

    const orders = await this.prisma.order.findMany({
      where: {
        tenantId,
        status: { in: kdsStatuses },
      },
      include: {
        items: {
          include: {

          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status as OrderStatus,
      fulfillmentType: this.mapFulfillmentType(o.fulfillmentType),
      notes: o.notes,
      items: o.items.map((i) => ({
        id: i.id,
        quantity: i.quantity,
        notes: i.notes,
        snapshotName: i.snapshotName,
        snapshotComposition: i.snapshotComposition,

      })),
      createdAt: o.createdAt.toISOString(),
      scheduledFor: o.scheduledFor ? o.scheduledFor.toISOString() : null,
      isScheduled: o.isScheduled ?? false,
    }));
  }

  async getOrderDetail(id: string, tenantId: string): Promise<OrderResponseDTO> {
    const order = await this.prisma.order.findFirst({
      where: { id, tenantId },
      include: {
        items: {
          include: {

          },
        },
        deliveryAddress: true,
        deliveryDriver: true,
        table: { select: { id: true, name: true } },
        timeline: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!order) throw new NotFoundException('Pedido não encontrado.');

    return this.mapOrderResponse(order);
  }

  async getPublicOrderSummary(identifier: string, token?: string): Promise<OrderResponseDTO> {
    const order = await this.prisma.order.findFirst({
      where: token
        ? {
            id: identifier,
            publicTrackingToken: token,
          }
        : {
            publicTrackingToken: identifier,
          },
      include: {
        items: {
          include: {},
        },
        deliveryAddress: true,
        deliveryDriver: true,
        table: { select: { id: true, name: true } },
        timeline: { orderBy: { createdAt: 'asc' } },
        paymentTransactions: {
          where: { method: 'pix' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!order) throw new NotFoundException('Pedido não encontrado.');

    const base = this.mapOrderResponse(order);
    const pixPayment = this.mapPixPayment(order.paymentTransactions?.[0]);

    return pixPayment ? { ...base, pixPayment } : base;
  }

  private mapPixPayment(paymentTransaction?: {
    id: string;
    status: string;
    createdAt: Date;
    metadata: Prisma.JsonValue | null;
  }): PixPaymentDTO | undefined {
    if (!paymentTransaction) return undefined;

    const metadata =
      paymentTransaction.metadata &&
      typeof paymentTransaction.metadata === 'object' &&
      !Array.isArray(paymentTransaction.metadata)
        ? (paymentTransaction.metadata as Record<string, unknown>)
        : null;

    const localPixPayment = metadata?.pixPayment;
    if (localPixPayment && typeof localPixPayment === 'object' && !Array.isArray(localPixPayment)) {
      const payload = localPixPayment as Record<string, unknown>;
      const qrCode = typeof payload.qrCode === 'string' ? payload.qrCode : '';
      const qrCodeBase64 = typeof payload.qrCodeBase64 === 'string' ? payload.qrCodeBase64 : '';
      const ticketUrl = typeof payload.ticketUrl === 'string' ? payload.ticketUrl : '';
      const expiresAt = typeof payload.expiresAt === 'string'
        ? payload.expiresAt
        : new Date(paymentTransaction.createdAt.getTime() + 30 * 60 * 1000).toISOString();

      if (qrCode || qrCodeBase64 || ticketUrl) {
        return {
          transactionId: paymentTransaction.id,
          qrCode,
          qrCodeBase64,
          ticketUrl,
          expiresAt,
          status: paymentTransaction.status as PixPaymentDTO['status'],
        };
      }
    }

    const mpPayload = metadata?.mercadoPagoPayment ?? metadata?.mercadoPagoResponse;
    if (!mpPayload || typeof mpPayload !== 'object' || Array.isArray(mpPayload)) return undefined;

    const payload = mpPayload as Record<string, unknown>;
    const poi = payload.point_of_interaction;
    if (!poi || typeof poi !== 'object' || Array.isArray(poi)) return undefined;

    const transactionData = (poi as Record<string, unknown>).transaction_data;
    if (!transactionData || typeof transactionData !== 'object' || Array.isArray(transactionData)) return undefined;

    const data = transactionData as Record<string, unknown>;
    const qrCode = typeof data.qr_code === 'string' ? data.qr_code : '';
    const qrCodeBase64 = typeof data.qr_code_base64 === 'string' ? data.qr_code_base64 : '';
    const ticketUrl = typeof data.ticket_url === 'string' ? data.ticket_url : '';

    if (!qrCode && !qrCodeBase64 && !ticketUrl) return undefined;

    return {
      transactionId: paymentTransaction.id,
      qrCode,
      qrCodeBase64,
      ticketUrl,
      expiresAt: new Date(paymentTransaction.createdAt.getTime() + 30 * 60 * 1000).toISOString(),
      status: paymentTransaction.status as PixPaymentDTO['status'],
    };
  }

  private mapOrderResponse(order: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    fulfillmentType: string;
    customerName: string;
    customerPhone: string;
    customerEmail: string | null;
    itemsSubtotal: Prisma.Decimal | number;
    discountTotal: Prisma.Decimal | number;
    deliveryFee: Prisma.Decimal | number;
    serviceFee: Prisma.Decimal | number;
    total: Prisma.Decimal | number;
    sourceChannel: string;
    notes: string | null;
    publicTrackingToken?: string | null;
    paymentMethod: PrismaPaymentMethod | null;
    changeFor: Prisma.Decimal | number | null;
    scheduledFor?: Date | null;
    isScheduled?: boolean | null;
    customerId?: string | null;
    couponId?: string | null;
    cashbackUsed?: Prisma.Decimal | number | null;
    deliveryDriverId?: string | null;
    deliveryDriver?: { name?: string | null; phone?: string | null; status?: string | null } | null;
    tableId?: string | null;
    tableNumber?: string | null;
    table?: { id: string; name: string } | null;
    items: Array<{
      id: string;
      lineType: string;
      productId: string | null;
      comboId: string | null;
      quantity: number;
      unitPrice: Prisma.Decimal | number;
      lineTotal: Prisma.Decimal | number;
      notes: string | null;
      snapshotName: string;
      snapshotImage: string | null;
      snapshotBasePrice: Prisma.Decimal | number;
      snapshotExtrasTotal: Prisma.Decimal | number;
      snapshotComposition: string | null;
      snapshotCatalogV2Json?: unknown;
    }>;
    deliveryAddress?: {
      street: string;
      number: string;
      complement: string | null;
      neighborhood: string;
      city: string;
      state: string;
      zipCode: string;
      reference?: string | null;
      lat?: number | null;
      lng?: number | null;
    } | null;
    timeline: Array<{
      id: string;
      status: OrderStatus;
      note: string | null;
      createdAt: Date;
    }>;
    createdAt: Date;
    updatedAt: Date;
    paymentTransactions?: Array<{
      id: string;
      status: string;
      createdAt: Date;
      metadata: Prisma.JsonValue | null;
    }>;
  }): OrderResponseDTO {
    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status as OrderStatus,
      fulfillmentType: order.fulfillmentType as 'delivery' | 'pickup',
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerEmail: order.customerEmail,
      itemsSubtotal: Number(order.itemsSubtotal),
      discountTotal: Number(order.discountTotal),
      deliveryFee: Number(order.deliveryFee),
      serviceFee: Number(order.serviceFee),
      total: Number(order.total),
      sourceChannel: order.sourceChannel,
      notes: order.notes,
      publicTrackingToken: order.publicTrackingToken ?? undefined,
      paymentMethod: this.mapPaymentMethod(order.paymentMethod ?? 'cash'),
      changeFor: order.changeFor ? Number(order.changeFor) : null,
      scheduledFor: order.scheduledFor ? order.scheduledFor.toISOString() : null,
      isScheduled: order.isScheduled ?? false,
      customerId: order.customerId,
      couponId: order.couponId,
      cashbackUsed: order.cashbackUsed ? Number(order.cashbackUsed) : null,
      tableId: order.tableId ?? null,
      tableNumber: order.tableNumber ?? null,
      table: order.table ?? null,
      deliveryDriverId: order.deliveryDriverId,
      deliveryDriverName: order.deliveryDriver?.name,
      deliveryDriverPhone: order.deliveryDriver?.phone,
      deliveryDriverStatus: order.deliveryDriver?.status,
      items: order.items.map((item) => ({
        id: item.id,
        lineType: item.lineType as 'product' | 'combo',
        productId: item.productId,
        comboId: item.comboId,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        lineTotal: Number(item.lineTotal),
        notes: item.notes,
        snapshotName: item.snapshotName,
        snapshotImage: item.snapshotImage,
        snapshotBasePrice: Number(item.snapshotBasePrice),
        snapshotExtrasTotal: Number(item.snapshotExtrasTotal),
        snapshotComposition: item.snapshotComposition,
        snapshotCatalogV2Json: item.snapshotCatalogV2Json,
      })),
      deliveryAddress: order.deliveryAddress
        ? {
            street: order.deliveryAddress.street,
            number: order.deliveryAddress.number,
            complement: order.deliveryAddress.complement || undefined,
            neighborhood: order.deliveryAddress.neighborhood,
            city: order.deliveryAddress.city,
            state: order.deliveryAddress.state,
            zipCode: order.deliveryAddress.zipCode,
            reference: order.deliveryAddress.reference || undefined,
            lat: order.deliveryAddress.lat ?? undefined,
            lng: order.deliveryAddress.lng ?? undefined,
          }
        : null,
      timeline: order.timeline.map((t) => ({
        id: t.id,
        status: t.status as OrderStatus,
        note: t.note,
        createdAt: t.createdAt.toISOString(),
      })),
      createdAt: order.createdAt ? order.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: order.updatedAt ? order.updatedAt.toISOString() : new Date().toISOString(),
    };
  }

  async updateOrderStatus(
    orderId: string,
    tenantId: string,
    dto: UpdateOrderStatusDTO,
    actorId?: string,
    options?: { marketplaceEvent?: boolean },
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
    });

    if (!order) throw new NotFoundException('Pedido não encontrado.');

    const currentStatus = order.status as OrderStatus;
    const nextStatus = dto.status;

    if (!ORDER_STATUS_TRANSITIONS[currentStatus]?.includes(nextStatus)) {
      throw new BadRequestException(
        `Transição inválida de ${currentStatus} para ${nextStatus}`,
      );
    }

    if (!options?.marketplaceEvent) {
      const marketplaceSync = await this.marketplaceStatusSyncService.handleInternalStatusChanged({
        tenantId,
        orderId,
        status: nextStatus,
        reason: dto.marketplaceReasonCode ?? null,
      });
      if (marketplaceSync.deferred) {
        return order;
      }
    }

    // Validation: if delivery and going out_for_delivery, must have driver
    if (order.fulfillmentType === 'delivery' && nextStatus === 'out_for_delivery' && !order.deliveryDriverId) {
      throw new BadRequestException('Não é possível despachar um pedido de entrega sem um entregador atribuído.');
    }

    const shouldCreateProductionJobs = nextStatus === 'preparing';

    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: nextStatus },
      });

      // Status side effects
      if (nextStatus === 'completed' || nextStatus === 'cancelled') {
        await tx.dineInTable.updateMany({
          where: { tenantId, activeOrderId: orderId },
          data: { status: 'free', activeOrderId: null },
        });
        if (order.deliveryDriverId) {
          const activeRunCount = await tx.deliveryRun.count({
            where: {
              tenantId,
              driverId: order.deliveryDriverId,
              status: { in: ['PENDING_ACCEPTANCE', 'ASSIGNED', 'IN_PROGRESS', 'RETURNING'] },
            },
          });
          if (activeRunCount === 0) {
            await tx.deliveryDriver.update({
              where: { id: order.deliveryDriverId },
              data: { status: 'available' },
            });
          }
        }
      }

      if (nextStatus === 'cancelled' && order.isScheduled) {
        await this.schedulingService.cancelByOrderInTransaction(
          tx,
          tenantId,
          orderId,
          dto.note,
        );
      }

      await tx.orderTimeline.create({
        data: {
          orderId,
          tenantId,
          status: nextStatus,
          note: dto.note || `Status alterado para ${nextStatus}.`,
          actorId,
        },
      });

      await this.revenueLedgerService.recordOrderStatusEvent({
        tenantId,
        orderId,
        orderStatus: nextStatus,
        orderTotal: order.total,
        sourceChannel: order.sourceChannel,
        occurredAt: new Date(),
        actorType: actorId ? 'tenant_user' : 'system',
        actorId,
        reason: dto.note ?? null,
        tx,
      });

      await this.authoritativeOrderAnalyticsService?.recordOrderStatusEvent({
        tenantId,
        orderId,
        orderStatus: nextStatus,
        orderTotal: order.total,
        occurredAt: new Date(),
        tx,
      });

      // Emitir via Socket para o storefront (tempo real)
      if (order.publicTrackingToken) {
        this.ordersGateway.emitOrderStatusUpdated(order.publicTrackingToken, order.orderNumber, nextStatus, dto.note);
      }

      // Se for cancelamento, emitir evento específico para o painel administrativo
      if (nextStatus === 'cancelled') {
        // emitOrderCancelled cobre o room do tenant (painel)
        // emitOrderStatusUpdated já foi enviado acima (linha 1171) para o storefront via publicTrackingToken
        this.ordersGateway.emitOrderCancelled(tenantId, {
          orderId,
          orderNumber: order.orderNumber,
        });

        // Reverter estoque teórico
        await this.inventoryService.reverseOrderDepletion(tenantId, orderId).catch(e => {
          this.logger.error(`Erro ao reverter estoque para pedido cancelado ${orderId}: ${e.message}`);
        });
      }

      // Se pedido foi marcado como pronto, emitir notificação especial
      if (nextStatus === 'ready_for_pickup' || nextStatus === 'ready_for_delivery') {
        this.ordersGateway.emitOrderReady(
          tenantId,
          order.orderNumber,
          order.customerName || undefined,
          order.fulfillmentType || undefined,
          orderId,
        );
      }

      // Disparar notificação WhatsApp (fire-and-forget, não bloqueia a transação)
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
      if (order.customerPhone && tenant) {
        this.whatsappService
          .notifyOrderStatus(tenantId, order.customerPhone, order.orderNumber, nextStatus, tenant.name)
          .catch((err) => this.logger.warn(`WhatsApp notification failed: ${err.message}`));
      }

      return updated;
    });

    if (shouldCreateProductionJobs) {
      const jobs = await this.kdsService.createProductionJobs(orderId, tenantId);
      if (jobs.length === 0) {
        const existingActiveJobsCount = await this.prisma.printJob.count({
          where: {
            tenantId,
            orderId,
            status: { in: ['pending', 'printing'] },
          },
        });
        if (existingActiveJobsCount === 0) {
          this.logger.error(`No active production jobs found for order ${orderId} after status ${nextStatus}`);
        }
      }

      const orderDetail = await this.getOrderDetail(orderId, tenantId);
      await this.printingService.createMainReceiptJobForOrder(tenantId, orderId, orderDetail);
    }

    if (nextStatus === 'completed') {
      await Promise.all([
        this.cashbackService.earnForOrder(tenantId, orderId).catch((e) => this.logger.error(`Error earning cashback: ${e.message}`)),
        this.loyaltyService.awardForOrder(tenantId, orderId).catch((e) => this.logger.error(`Error awarding loyalty: ${e.message}`)),
      ]);
    }
    const cancelledRun = nextStatus === 'cancelled'
      ? await this.deliveryRunsService?.cancelStopFromOrderCancellation(
          tenantId,
          orderId,
          dto.note ?? 'Pedido cancelado',
        )
      : null;

    if (nextStatus === 'ready_for_delivery') {
      const pendingStop = await this.prisma.deliveryStop.findFirst({
        where: {
          tenantId,
          orderId,
          status: 'PENDING',
          run: { status: { in: ['PENDING_ACCEPTANCE', 'ASSIGNED'] } },
        },
        select: { id: true, run: { select: { id: true, driverId: true } } },
      });
      if (pendingStop) {
        const occurredAt = new Date().toISOString();
        this.deliveryTrackingGateway?.emitDriverRouteEvent(tenantId, pendingStop.run.driverId, {
          eventId: `delivery.stop_updated:${pendingStop.run.id}:${pendingStop.id}:${occurredAt}`,
          type: 'delivery.stop_updated',
          change: 'updated',
          runId: pendingStop.run.id,
          stopId: pendingStop.id,
          occurredAt,
        });
      }
    }

    if (order.deliveryDriverId) {
      const event = this.createDriverDeliveryEvent(
        nextStatus === 'cancelled' ? 'delivery.cancelled' : 'delivery.updated',
        orderId,
        order.orderNumber,
        nextStatus,
        updated.updatedAt,
      );
      this.deliveryTrackingGateway?.emitDriverDeliveryEvent(tenantId, order.deliveryDriverId, event);
      if (nextStatus === 'cancelled') {
        this.enqueueDriverDeliveryPush(tenantId, order.deliveryDriverId, event, {
          title: 'Entrega cancelada',
          body: `O pedido #${order.orderNumber} foi cancelado.`,
        });
        if (cancelledRun) {
          const stop = cancelledRun.stops.find((item) => item.orderId === orderId);
          const occurredAt = new Date().toISOString();
          const routeEvent: DriverRouteEvent = {
            eventId: `delivery.stop_updated:${cancelledRun.id}:${stop?.id ?? orderId}:${occurredAt}`,
            type: 'delivery.stop_updated',
            change: 'cancelled',
            runId: cancelledRun.id,
            ...(stop ? { stopId: stop.id } : {}),
            occurredAt,
          };
          this.deliveryTrackingGateway?.emitDriverRouteEvent(
            tenantId,
            order.deliveryDriverId,
            routeEvent,
          );
        }
      }
    }

    return updated;
  }

  async confirmPosOrderInTransaction(
    tx: Prisma.TransactionClient,
    orderId: string,
    tenantId: string,
    actorId: string,
  ) {
    const order = await tx.order.findFirst({ where: { id: orderId, tenantId } });
    if (!order) throw new NotFoundException('Pedido não encontrado.');

    const currentStatus = order.status as OrderStatus;
    if (!ORDER_STATUS_TRANSITIONS[currentStatus]?.includes(OrderStatus.confirmed)) {
      throw new BadRequestException(`Transição inválida de ${currentStatus} para ${OrderStatus.confirmed}`);
    }

    const updated = await tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.confirmed },
    });

    await tx.orderTimeline.create({
      data: {
        orderId,
        tenantId,
        status: OrderStatus.confirmed,
        note: 'Venda finalizada via PDV.',
        actorId,
      },
    });

    await this.revenueLedgerService.recordOrderStatusEvent({
      tenantId,
      orderId,
      orderStatus: OrderStatus.confirmed,
      orderTotal: order.total,
      sourceChannel: order.sourceChannel,
      occurredAt: new Date(),
      actorType: 'tenant_user',
      actorId,
      reason: 'Venda finalizada via PDV.',
      tx,
    });

    await this.authoritativeOrderAnalyticsService?.recordOrderStatusEvent({
      tenantId,
      orderId,
      orderStatus: OrderStatus.confirmed,
      orderTotal: order.total,
      occurredAt: new Date(),
      tx,
    });

    return updated;
  }

  async runConfirmedOrderSideEffects(orderId: string, tenantId: string): Promise<void> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId, status: OrderStatus.confirmed },
    });
    if (!order) throw new NotFoundException('Pedido confirmado não encontrado.');

    if (order.publicTrackingToken) {
      this.ordersGateway.emitOrderStatusUpdated(
        order.publicTrackingToken,
        order.orderNumber,
        OrderStatus.confirmed,
        'Venda finalizada via PDV.',
      );
    }

    const orderDetail = await this.getOrderDetail(orderId, tenantId);
    await this.printingService.createMainReceiptJobForOrder(tenantId, orderId, orderDetail);

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (order.customerPhone && tenant) {
      await this.whatsappService
        .notifyOrderStatus(tenantId, order.customerPhone, order.orderNumber, OrderStatus.confirmed, tenant.name)
        .catch((error: Error) => this.logger.warn(`WhatsApp notification failed: ${error.message}`));
    }
  }

  async updateOrderNotes(orderId: string, tenantId: string, dto: UpdateOrderNotesDTO, actorId?: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
    });

    if (!order) throw new NotFoundException('Pedido não encontrado.');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { notes: dto.notes || null },
      });

      await tx.orderTimeline.create({
        data: {
          orderId,
          tenantId,
          status: order.status,
          note: `Observação do pedido alterada.`,
          actorId,
        },
      });

      if (order.publicTrackingToken) {
        this.ordersGateway.emitOrderStatusUpdated(order.publicTrackingToken, order.orderNumber, order.status as OrderStatus, 'Observação atualizada');
      }

      return updated;
    });
  }

  async editOrder(orderId: string, tenantId: string, dto: EditOrderDTO, actorId?: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException('Loja não encontrada.');

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: {
        items: {
          include: {

          },
        },
        deliveryAddress: true,
        paymentTransactions: {
          where: { status: 'confirmed' }
        }
      },
    });

    if (!order) throw new NotFoundException('Pedido não encontrado.');

    // Validar se status permite edição
    const allowedStatuses = ['pending', 'confirmed', 'preparing'];
    if (!allowedStatuses.includes(order.status)) {
      throw new BadRequestException(`Não é possível editar pedido com status ${order.status}`);
    }

    // Regra Financeira: Bloquear edição se pagamento online já estiver confirmado/pago
    // Exceto se for pagamento offline (dinheiro, pix manual, etc)
    const offlineMethods = ['cash', 'pix', 'card_on_delivery', 'other'];
    if (!offlineMethods.includes(order.paymentMethod || '') && order.paymentTransactions.length > 0) {
      throw new BadRequestException('Não é possível editar pedido com pagamento online já aprovado.');
    }

    let finalItems: CreateOrderItemDTO[] = [];
    const timelineNotes: string[] = [];

    if (dto.operations && dto.operations.length > 0) {
      // 1. Converter itens atuais para DTOs
      finalItems = order.items.map((item) => this.mapOrderItemToCreateDTO(item));

      // 2. Aplicar operações
      for (const op of dto.operations) {
        switch (op.type) {
          case 'add_item':
            if (op.payload) {
              finalItems.push(op.payload);
              timelineNotes.push(`Item adicionado: ${op.payload.notes || 'Novo item'}`);
            }
            break;

          case 'remove_item':
            if (op.orderItemId) {
              const idx = order.items.findIndex((i) => i.id === op.orderItemId);
              if (idx !== -1) {
                const removedItem = order.items[idx];
                timelineNotes.push(`Item removido: ${removedItem.snapshotName}`);
                // Na lista de DTOs, precisamos identificar qual item remover. 
                // Como os DTOs não têm ID original, vamos usar o índice.
                finalItems.splice(idx, 1);
              }
            }
            break;

          case 'update_quantity':
            if (op.orderItemId && op.quantity !== undefined) {
              const idx = order.items.findIndex((i) => i.id === op.orderItemId);
              if (idx !== -1) {
                const oldQty = order.items[idx].quantity;
                timelineNotes.push(`Quantidade alterada (${order.items[idx].snapshotName}): ${oldQty} -> ${op.quantity}`);
                finalItems[idx].quantity = op.quantity;
              }
            }
            break;

          case 'update_item_notes':
            if (op.orderItemId) {
              const idx = order.items.findIndex((i) => i.id === op.orderItemId);
              if (idx !== -1) {
                timelineNotes.push(`Observação alterada em "${order.items[idx].snapshotName}"`);
                finalItems[idx].notes = op.notes;
              }
            }
            break;

          case 'update_order_notes':
            timelineNotes.push(`Observação geral do pedido alterada`);
            break;
        }
      }
    } else if (dto.items) {
      // Fallback para substituição total
      finalItems = dto.items;
      timelineNotes.push(`Itens do pedido alterados (substituição total).`);
    }

    if (finalItems.length === 0) {
      throw new BadRequestException('O pedido deve ter pelo menos 1 item.');
    }

    const customerId = order.customerId;
    const paymentInfo = {
      method: this.mapPaymentMethod(order.paymentMethod),
      changeFor: order.changeFor ? Number(order.changeFor) : undefined,
    };

    // 1. Revalidate with CheckoutValidatorService using the new items array
    const validation = await this.checkoutValidator.validate(tenant.slug, finalItems, {
      customerId: customerId,
      couponCode: undefined, // Cupom re-validar pode ser complexo, por ora mantemos o que estava ou ignoramos se mudar muito
      useCashbackAmount: undefined,
      deliveryAddress: order.deliveryAddress ? {
        street: order.deliveryAddress.street,
        number: order.deliveryAddress.number,
        complement: order.deliveryAddress.complement || undefined,
        neighborhood: order.deliveryAddress.neighborhood,
        city: order.deliveryAddress.city,
        state: order.deliveryAddress.state,
        zipCode: order.deliveryAddress.zipCode,
      } : undefined,
      payment: paymentInfo,
      channel: order.fulfillmentType === 'delivery' ? 'storefront_delivery' : 'storefront_pickup',
    });

    const { lines, itemsSubtotal, discountTotal, deliveryFee, total } = validation;

    // 2. Transaction to replace items
    await this.prisma.$transaction(async (tx) => {
      // Process order notes update if requested
      if (dto.operations) {
        const orderNotesOp = dto.operations.find(op => op.type === 'update_order_notes');
        if (orderNotesOp) {
          await tx.order.update({
            where: { id: order.id },
            data: { notes: orderNotesOp.notes || null },
          });
        }
      }

      // Delete old items and their relations

      await tx.orderItem.deleteMany({ where: { orderId: order.id } });

      // Update order totals
      await tx.order.update({
        where: { id: order.id },
        data: {
          itemsSubtotal,
          discountTotal: discountTotal || 0,
          deliveryFee,
          normalDeliveryFee: deliveryFee,
          total: total,
        },
      });

      // Create new items
      for (const line of lines) {
        const snapshotCatalogV2Json = line.snapshotCatalogV2Json;
        const sourceUpsellId = line.lineType === 'product' ? line.sourceUpsellId || null : null;

        await tx.orderItem.create({
          data: {
            orderId: order.id,
            tenantId,
            lineType: line.lineType,
            productId: line.lineType === 'product' ? line.productId : null,
            comboId: line.lineType === 'combo' ? line.comboId : null,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
            notes: line.notes || null,
            snapshotName: line.name,
            snapshotImage: line.image,
            snapshotBasePrice: line.basePrice,
            snapshotExtrasTotal: line.extrasTotal,
            snapshotComposition: line.composition || null,
            snapshotCatalogV2Json: snapshotCatalogV2Json as Prisma.InputJsonValue,
            sourceUpsellId,
          },
        });


      }

      // Add to timeline
      const finalNote = timelineNotes.join('; ') + (dto.reason ? ` | Motivo: ${dto.reason}` : '');
      await tx.orderTimeline.create({
        data: {
          orderId,
          tenantId,
          status: order.status,
          note: `Pedido editado: ${finalNote}`,
          actorId,
        },
      });
    }, { timeout: 20000 });

    // Notify sockets
    this.ordersGateway.server.to(`tenant:${tenantId}`).emit('orderUpdated', {
      orderId: order.id, 
      orderNumber: order.orderNumber 
    });

    return this.getOrderDetail(order.id, tenantId);
  }

  private mapOrderItemToCreateDTO(
    item: Prisma.OrderItemGetPayload<Record<string, never>>,
  ): CreateOrderItemDTO {
    // Se tiver snapshotCatalogV2Json, usamos ele como base
    if (item.snapshotCatalogV2Json) {
      const v2 = item.snapshotCatalogV2Json as Prisma.JsonObject;
      return {
        lineType: item.lineType as OrderLineType,
        productId: item.productId || undefined,
        quantity: item.quantity,
        notes: item.notes || undefined,
        selections: (v2.selections as unknown) as CreateOrderItemSelectionGroupDTO[] | undefined,
        slots: (v2.slots as unknown) as CreateOrderItemComboSlotSelectionDTO[] | undefined,
        pizzaComposition: (v2.pizzaComposition as unknown) as PizzaCompositionDTO | undefined,
      };
    }

    // Fallback mínimo se não tiver json (pode acontecer com produtos muito simples migrados)
    return {
      lineType: item.lineType as OrderLineType,
      productId: item.productId || undefined,
      comboId: item.comboId || undefined,
      quantity: item.quantity,
      notes: item.notes || undefined,
    };
  }

  private mapOrderToDispatchItem(
    o: Prisma.OrderGetPayload<{ include: { deliveryAddress: true; deliveryDriver: true } }>,
  ): OrderDispatchItemDTO {
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customerName,
      customerPhone: o.customerPhone ?? undefined,
      fulfillmentType: this.mapFulfillmentType(o.fulfillmentType),
      status: o.status as OrderStatus,
      deliveryAddress: o.deliveryAddress
        ? {
            street: o.deliveryAddress.street,
            number: o.deliveryAddress.number,
            neighborhood: o.deliveryAddress.neighborhood,
            city: o.deliveryAddress.city,
            state: o.deliveryAddress.state,
            zipCode: o.deliveryAddress.zipCode,
          }
        : undefined,
      deliveryLat: o.deliveryAddress?.lat ?? undefined,
      deliveryLng: o.deliveryAddress?.lng ?? undefined,
      deliveryDriverId: o.deliveryDriverId || undefined,
      deliveryDriverName: o.deliveryDriver?.name || undefined,
      deliveryDriverStatus: o.deliveryDriver?.status || undefined,
      deliveryDriverPhone: o.deliveryDriver?.phone || undefined,
      total: Number(o.total),
      createdAt: o.createdAt.toISOString(),
    };
  }

  private async releaseDriverIfIdle(
    tx: Prisma.TransactionClient,
    tenantId: string,
    driverId: string,
    excludeOrderId?: string,
  ): Promise<void> {
    const activeDeliveries = await tx.order.count({
      where: {
        tenantId,
        deliveryDriverId: driverId,
        status: { in: ['ready_for_delivery', 'out_for_delivery'] },
        ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}),
      },
    });

    if (activeDeliveries === 0) {
      await tx.deliveryDriver.update({
        where: { id: driverId },
        data: { status: 'available' },
      });
    }
  }

  async getDispatchOrders(tenantId: string): Promise<OrderDispatchItemDTO[]> {
    const dispatchStatuses: OrderStatus[] = [
      'ready_for_delivery',
      'out_for_delivery',
    ];

    const orders = await this.prisma.order.findMany({
      where: {
        tenantId,
        fulfillmentType: 'delivery',
        status: { in: dispatchStatuses },
      },
      include: {
        deliveryAddress: true,
        deliveryDriver: true,
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
    });

    return orders.map((o) => this.mapOrderToDispatchItem(o));
  }

  async assignDriver(
    tenantId: string,
    orderId: string,
    driverId: string | null,
    actorId?: string,
  ): Promise<OrderDispatchItemDTO> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: {
        deliveryDriver: true,
        marketplaceOrders: { select: { provider: true, deliveryOwnership: true } },
      },
    });

    if (!order) throw new NotFoundException('Pedido não encontrado.');

    if (order.fulfillmentType !== 'delivery') {
      throw new BadRequestException('Somente pedidos de entrega podem receber entregador.');
    }

    if (driverId && !evaluateOwnFleetEligibility(order.marketplaceOrders).eligible) {
      throw new BadRequestException('A logistica deste pedido pertence ao marketplace e nao pode receber entregador interno.');
    }

    const previousDriverId = order.deliveryDriverId;

    if (driverId) {
      const driver = await this.prisma.deliveryDriver.findUnique({
        where: { id: driverId, tenantId },
      });

      if (!driver) {
        throw new BadRequestException('Entregador não encontrado ou não pertence a esta loja.');
      }

      if (!driver.isActive || driver.status === 'offline') {
        throw new BadRequestException('O entregador selecionado está offline ou inativo.');
      }

      if (driver.status === 'busy' && previousDriverId !== driverId) {
        const otherActive = await this.prisma.order.count({
          where: {
            tenantId,
            deliveryDriverId: driverId,
            id: { not: orderId },
            status: { in: ['ready_for_delivery', 'out_for_delivery'] },
          },
        });
        if (otherActive > 0) {
          throw new BadRequestException(
            'Este entregador já possui outra entrega em andamento.',
          );
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { deliveryDriverId: driverId },
      });

      if (previousDriverId && previousDriverId !== driverId) {
        await this.releaseDriverIfIdle(tx, tenantId, previousDriverId, orderId);
      }

      if (driverId) {
        await tx.deliveryDriver.update({
          where: { id: driverId },
          data: { status: 'busy' },
        });
      } else if (previousDriverId) {
        await this.releaseDriverIfIdle(tx, tenantId, previousDriverId, orderId);
      }

      await tx.orderTimeline.create({
        data: {
          orderId,
          tenantId,
          status: order.status as OrderStatus,
          note: driverId
            ? `Entregador atribuído: ${(await tx.deliveryDriver.findUnique({ where: { id: driverId } }))?.name ?? driverId}.`
            : `Entregador removido do pedido.`,
          actorId,
        },
      });
    });

    const refreshed = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: { deliveryAddress: true, deliveryDriver: true },
    });

    if (!refreshed) {
      throw new NotFoundException('Pedido não encontrado após atribuição.');
    }

    this.ordersGateway.server.to(`tenant:${tenantId}`).emit('driverAssigned', {
      orderId,
      driverId,
      orderNumber: refreshed.orderNumber,
    });

    this.ordersGateway.server.to(`tenant:${tenantId}`).emit('orderUpdated', {
      orderId,
      orderNumber: refreshed.orderNumber,
    });

    const eventType = driverId && previousDriverId !== driverId
      ? 'delivery.assigned'
      : 'delivery.updated';
    const driverEvent = this.createDriverDeliveryEvent(
      eventType,
      orderId,
      refreshed.orderNumber,
      refreshed.status,
      refreshed.updatedAt,
    );

    if (driverId && eventType === 'delivery.assigned') {
      this.deliveryTrackingGateway?.emitDriverDeliveryEvent(tenantId, driverId, driverEvent);
    }
    if (previousDriverId && previousDriverId !== driverId) {
      const removedEvent = { ...driverEvent, type: 'delivery.updated' as const };
      this.deliveryTrackingGateway?.emitDriverDeliveryEvent(tenantId, previousDriverId, removedEvent);
      this.enqueueDriverDeliveryPush(tenantId, previousDriverId, removedEvent, {
        title: 'Entrega removida',
        body: `O pedido #${refreshed.orderNumber} não está mais atribuído a você.`,
      });
    }

    if (driverId && eventType === 'delivery.assigned') {
      this.enqueueDriverDeliveryPush(tenantId, driverId, driverEvent, {
        title: 'Nova Entrega Atribuída!',
        body: `Você foi designado para o pedido #${refreshed.orderNumber}.`,
      });
    }

    return this.mapOrderToDispatchItem(refreshed);
  }

  private createDriverDeliveryEvent(
    type: DriverDeliveryEvent['type'],
    orderId: string,
    orderNumber: string,
    status: OrderStatus,
    occurredAt: Date,
  ): DriverDeliveryEvent {
    const timestamp = occurredAt.toISOString();
    return {
      eventId: `${type}:${orderId}:${timestamp}`,
      type,
      orderId,
      orderNumber,
      status,
      occurredAt: timestamp,
    };
  }

  private enqueueDriverDeliveryPush(
    tenantId: string,
    driverId: string,
    event: DriverDeliveryEvent,
    message: { title: string; body: string },
  ) {
    this.pushService.enqueueDriverNotification(tenantId, driverId, {
      ...message,
      tag: `delivery-${event.orderId}`,
      url: '/',
      data: { ...event, url: '/' },
    }).catch((error: unknown) => this.logger.error('Error enqueueing driver push', error));
  }

  async logPrint(orderId: string, tenantId: string, actorId?: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
    });

    if (!order) throw new NotFoundException('Pedido não encontrado.');

    await this.prisma.orderTimeline.create({
      data: {
        orderId,
        tenantId,
        status: order.status,
        note: `Pedido impresso.`,
        actorId,
      },
    });

    return { success: true };
  }

  async getLatestCustomerOrder(tenantId: string, customerId: string) {
    return this.prisma.order.findFirst({
      where: { tenantId, customerId },
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
        timeline: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
  }
}
