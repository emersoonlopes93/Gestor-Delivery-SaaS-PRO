import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PaymentTxStatus, OrderStatus, Prisma, DineInTable, PaymentMethod as PrismaPaymentMethod } from '@prisma/client';
import { PaymentMethod as SharedPaymentMethod } from '@gestor/types';
import { CheckoutValidatorService } from './checkout-validator.service';
import { CustomerService } from '../crm/customer.service';
import { CashbackService } from '../promotions/cashback.service';
import { TheoreticalStockService } from '../inventory/theoretical-stock.service';
import { PaymentGatewayService } from '../payment-gateway/payment-gateway.service';
import { SchedulingService } from '../scheduling/scheduling.service';
import { WhatsappService } from '../notifications/whatsapp.service';
import type {
  CreateOrderDTO,
  OrderResponseDTO,
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
} from '@gestor/types';
import { ORDER_STATUS_TRANSITIONS, UpdateOrderStatusDTO } from '@gestor/types';
import { generatePublicTrackingToken } from '../common/utils/tracking-token.util';
import { OrdersGateway } from './orders.gateway';
import { KdsService } from '../kds/kds.service';

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

  private mapFulfillmentType(f: string | null): 'delivery' | 'pickup' {
    if (f === 'pickup') return 'pickup';
    return 'delivery';
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly checkoutValidator: CheckoutValidatorService,
    private readonly customerService: CustomerService,
    private readonly cashbackService: CashbackService,
    private readonly inventoryService: TheoreticalStockService,
    private readonly paymentGatewayService: PaymentGatewayService,
    private readonly schedulingService: SchedulingService,
    @Inject(forwardRef(() => WhatsappService))
    private readonly whatsappService: WhatsappService,
    private readonly ordersGateway: OrdersGateway,
    private readonly kdsService: KdsService,
  ) {}

  async createOrder(slug: string, dto: CreateOrderDTO): Promise<OrderResponseDTO> {
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
      dineInTable = await this.prisma.dineInTable.findUnique({
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
    const { tenantId, lines, itemsSubtotal, discountTotal, deliveryFee, total, couponId, cashbackUsed } = validation;

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

    // 4. Transactional order creation
    const finalTotal = total; 

    const order = await this.prisma.$transaction(
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
            serviceFee: 0,
            total: finalTotal,
            sourceChannel: dto.sourceChannel || 'storefront',
            idempotencyKey: dto.idempotencyKey,
            notes: dto.notes || null,
            customerId,
            couponId,
            cashbackUsed,
            paymentMethod: dto.payment.method as PrismaPaymentMethod,
            changeFor: dto.payment.changeFor || null,
            publicTrackingToken: generatePublicTrackingToken(),
            tableNumber: dineInTable?.name || null,
          },
        });

        // Create order items
        for (const line of lines) {
          const snapshotCatalogV2Json = (line as ValidatedLine & { snapshotCatalogV2Json?: unknown })
            .snapshotCatalogV2Json as Prisma.InputJsonValue | undefined;

          const sourceUpsellId = (line as ValidatedLine & { sourceUpsellId?: string }).sourceUpsellId || null;

          const orderItem = await tx.orderItem.create({
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

          // Legacy complements support
          if (!snapshotCatalogV2Json) {
            if (line.lineType === 'product' && line.complements) {
              for (const c of line.complements) {
                const complementItemId = (c as { itemId?: string; complementItemId?: string }).itemId || (c as { itemId?: string; complementItemId?: string }).complementItemId || '';
                await tx.orderItemComplement.create({
                  data: {
                    orderItemId: orderItem.id,
                    tenantId,
                    complementItemId,
                    snapshotName: c.snapshotName,
                    snapshotPrice: c.snapshotPrice,
                  },
                });
              }
            } else if (line.lineType === 'combo' && line.comboSelections) {
              for (const s of line.comboSelections) {
                const comboBlockItemId = (s as { blockItemId?: string; comboBlockItemId?: string }).blockItemId || (s as { blockItemId?: string; comboBlockItemId?: string }).comboBlockItemId || '';
                await tx.orderItemComboSelection.create({
                  data: {
                    orderItemId: orderItem.id,
                    tenantId,
                    comboBlockItemId,
                    snapshotBlockName: s.snapshotBlockName,
                    snapshotProductName: s.snapshotProductName,
                    snapshotAdditionalPrice: s.snapshotAdditionalPrice,
                  },
                });
              }
            }
          }
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
              lat: dto.deliveryAddress.lat || null,
              lng: dto.deliveryAddress.lng || null,
            },
          });
        }

        // Timeline entry
        await tx.orderTimeline.create({
          data: {
            orderId: newOrder.id,
            tenantId,
            status: 'pending',
            note: `Pedido recebido via ${dto.sourceChannel || 'storefront'}.`,
          },
        });

        // Update DineInTable
        if (dineInTable) {
          await tx.dineInTable.update({
            where: { id: dineInTable.id },
            data: {
              activeOrderId: newOrder.id,
              status: 'occupied',
            },
          });
        }

        return newOrder;
      },
      {
        timeout: 20_000,
        maxWait: 5_000,
      },
    );

    // Process Stock Depletion
    await this.inventoryService.processOrderDepletion(tenantId, order.id).catch(e => {
        this.logger.error(`Error processing stock depletion for order ${order.id}: ${e.message}`);
    });

    // Update Cashback Ledger & Coupon Usage
    if (cashbackUsed && customerId) {
      await this.cashbackService.createTransaction({
        tenantId,
        customerId: customerId,
        type: 'used',
        amount: cashbackUsed,
        orderId: order.id,
        description: `Usado no pedido ${order.orderNumber}`
      }).catch(e => this.logger.error(`Error applying cashback: ${e.message}`));
    }

    if (couponId) {
      await this.prisma.coupon.update({
        where: { id: couponId },
        data: { usedCount: { increment: 1 } }
      }).catch(e => this.logger.error(`Error updating coupon usage: ${e.message}`));
    }

    // Criar agendamento se especificado
    if (dto.scheduledFor && dto.timeSlotId && customerId) {
      try {
        await this.schedulingService.createScheduledOrder({
          customerId,
          scheduledFor: new Date(dto.scheduledFor),
          timeSlotId: dto.timeSlotId,
          estimatedDuration: dto.estimatedDuration || 30, // 30 min padrão
          notes: `Agendado para pedido ${order.orderNumber}`,
        });
        this.logger.log(`Scheduled order ${order.id} for ${dto.scheduledFor}`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Error creating scheduled order: ${message}`);
        // Não falhar o pedido, apenas logar erro
      }
    }

    const orderDetail = await this.getOrderDetail(order.id, tenantId);
    
    // Emitir via Socket para o painel administrativo (tempo real)
    this.ordersGateway.emitNewOrder(tenantId, {
      ...orderDetail,
      itemCount: orderDetail.items.length,
    });
    
    // Se pagamento for PIX, gerar QR code
    if (dto.payment.method === 'pix') {
      try {
        const pixPayment = await this.paymentGatewayService.createPixPayment(
          order.id,
          dto.customerEmail || '',
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
          dto.customerEmail || '',
          dto.customerName,
          dto.returnUrl || 'https://gestor-delivery-pro.vercel.app', // Fallback URL if frontend didnt send
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
        fulfillmentType: o.fulfillmentType as 'delivery' | 'pickup',
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        total: Number(o.total),
        itemCount: o._count.items,
        paymentMethod: this.mapPaymentMethod(o.paymentMethod),
        sourceChannel: o.sourceChannel,
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
      },
      orderBy: { createdAt: 'asc' },
    });

    return orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status as OrderStatus,
      fulfillmentType: o.fulfillmentType as 'delivery' | 'pickup',
      customerName: o.customerName,
      total: Number(o.total),
      itemCount: o.items.reduce((sum, i) => sum + i.quantity, 0),
      itemsSummary: o.items.map((i) => `${i.quantity}x ${i.snapshotName}`).join(', '),
      sourceChannel: o.sourceChannel,
      createdAt: o.createdAt.toISOString(),
      deliveryDriverId: o.deliveryDriverId || undefined,
      deliveryDriverName: o.deliveryDriver?.name || undefined,
      deliveryDriverStatus: o.deliveryDriver?.status || undefined,
    }));
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
            complements: true,
            comboSelections: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status as OrderStatus,
      fulfillmentType: o.fulfillmentType as 'delivery' | 'pickup',
      notes: o.notes,
      items: o.items.map((i) => ({
        id: i.id,
        quantity: i.quantity,
        notes: i.notes,
        snapshotName: i.snapshotName,
        snapshotComposition: i.snapshotComposition,
        complements: i.complements.map((c) => ({
          id: c.id,
          snapshotName: c.snapshotName,
        })),
        comboSelections: i.comboSelections.map((s) => ({
          id: s.id,
          snapshotBlockName: s.snapshotBlockName,
          snapshotProductName: s.snapshotProductName,
        })),
      })),
      createdAt: o.createdAt.toISOString(),
    }));
  }

  async getOrderDetail(id: string, tenantId: string): Promise<OrderResponseDTO> {
    const order = await this.prisma.order.findFirst({
      where: { id, tenantId },
      include: {
        items: {
          include: {
            complements: true,
            comboSelections: true,
          },
        },
        deliveryAddress: true,
        deliveryDriver: true,
        timeline: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!order) throw new NotFoundException('Pedido não encontrado.');

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
        publicTrackingToken: order.publicTrackingToken,
        paymentMethod: this.mapPaymentMethod(order.paymentMethod),
        changeFor: order.changeFor ? Number(order.changeFor) : null,
      customerId: order.customerId,
      couponId: order.couponId,
      cashbackUsed: order.cashbackUsed ? Number(order.cashbackUsed) : null,
      
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
        complements: item.complements.map((c) => ({
          id: c.id,
          complementItemId: c.complementItemId,
          snapshotName: c.snapshotName,
          snapshotPrice: Number(c.snapshotPrice),
        })),
        comboSelections: item.comboSelections.map((s) => ({
          id: s.id,
          comboBlockItemId: s.comboBlockItemId,
          snapshotBlockName: s.snapshotBlockName,
          snapshotProductName: s.snapshotProductName,
          snapshotAdditionalPrice: Number(s.snapshotAdditionalPrice),
        })),
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
            lat: order.deliveryAddress.lat || undefined,
            lng: order.deliveryAddress.lng || undefined,
          }
        : null,
      timeline: order.timeline.map((t) => ({
        id: t.id,
        status: t.status as OrderStatus,
        note: t.note,
        createdAt: t.createdAt.toISOString(),
      })),
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  async updateOrderStatus(orderId: string, tenantId: string, dto: UpdateOrderStatusDTO, actorId?: string) {
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

    // Validation: if delivery and going out_for_delivery, must have driver
    if (order.fulfillmentType === 'delivery' && nextStatus === 'out_for_delivery' && !order.deliveryDriverId) {
      throw new BadRequestException('Não é possível despachar um pedido de entrega sem um entregador atribuído.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: nextStatus },
      });

      // Status side effects
      if (nextStatus === 'completed' || nextStatus === 'cancelled') {
        if (order.deliveryDriverId) {
          await tx.deliveryDriver.update({
            where: { id: order.deliveryDriverId },
            data: { status: 'available' },
          });
        }
      }

      if (nextStatus === 'confirmed' || nextStatus === 'preparing') {
        await this.kdsService.createProductionJobs(orderId).catch((err) => {
          this.logger.error(`Error creating production jobs for order ${orderId}: ${err.message}`);
        });
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

      // Emitir via Socket para o storefront (tempo real)
      if (order.publicTrackingToken) {
        this.ordersGateway.emitOrderStatusUpdated(order.publicTrackingToken, order.orderNumber, nextStatus, dto.note);
      }

      // Se for cancelamento, emitir evento específico para o painel administrativo
      if (nextStatus === 'cancelled') {
        this.ordersGateway.emitOrderStatusUpdated(order.publicTrackingToken || '', order.orderNumber, OrderStatus.cancelled, dto.note);
        // Também emitimos para o tenant room caso o painel administrativo queira ouvir por lá
        this.ordersGateway.server.to(`tenant:${tenantId}`).emit('orderCancelled', { 
          orderId, 
          orderNumber: order.orderNumber 
        });

        // Reverter estoque teórico
        await this.inventoryService.reverseOrderDepletion(tenantId, orderId).catch(e => {
          this.logger.error(`Erro ao reverter estoque para pedido cancelado ${orderId}: ${e.message}`);
        });
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
            complements: true,
            comboSelections: true,
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
      await tx.orderItemComplement.deleteMany({ where: { orderItem: { orderId: order.id } } });
      await tx.orderItemComboSelection.deleteMany({ where: { orderItem: { orderId: order.id } } });
      await tx.orderItem.deleteMany({ where: { orderId: order.id } });

      // Update order totals
      await tx.order.update({
        where: { id: order.id },
        data: {
          itemsSubtotal,
          discountTotal: discountTotal || 0,
          deliveryFee,
          total: total,
        },
      });

      // Create new items
      for (const line of lines) {
        const snapshotCatalogV2Json = line.snapshotCatalogV2Json;
        const sourceUpsellId = line.lineType === 'product' ? line.sourceUpsellId || null : null;

        const orderItem = await tx.orderItem.create({
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

        // Legacy complements support
        if (!snapshotCatalogV2Json) {
          if (line.lineType === 'product' && line.complements) {
            for (const c of line.complements) {
              await tx.orderItemComplement.create({
                data: {
                  orderItemId: orderItem.id,
                  tenantId,
                  complementItemId: c.complementItemId,
                  snapshotName: c.snapshotName,
                  snapshotPrice: c.snapshotPrice,
                },
              });
            }
          } else if (line.lineType === 'combo' && line.comboSelections) {
            for (const s of line.comboSelections) {
              await tx.orderItemComboSelection.create({
                data: {
                  orderItemId: orderItem.id,
                  tenantId,
                  comboBlockItemId: s.comboBlockItemId,
                  snapshotBlockName: s.snapshotBlockName,
                  snapshotProductName: s.snapshotProductName,
                  snapshotAdditionalPrice: s.snapshotAdditionalPrice,
                },
              });
            }
          }
        }
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
    item: Prisma.OrderItemGetPayload<{ include: { complements: true; comboSelections: true } }>,
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

    // Fallback para legacy
    return {
      lineType: item.lineType as OrderLineType,
      productId: item.productId || undefined,
      comboId: item.comboId || undefined,
      quantity: item.quantity,
      notes: item.notes || undefined,
      complements: item.complements?.map((c) => {
        const legacy = c as Record<string, unknown>;
        return {
          groupId: (legacy.groupId as string | undefined) || '',
          itemId: c.complementItemId,
        };
      }),
      comboSelections: item.comboSelections?.map((s) => {
        const legacy = s as Record<string, unknown>;
        return {
          blockId: (legacy.blockId as string | undefined) || '',
          blockItemId: s.comboBlockItemId,
        };
      }),
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
      fulfillmentType: o.fulfillmentType as 'delivery' | 'pickup',
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
      include: { deliveryDriver: true },
    });

    if (!order) throw new NotFoundException('Pedido não encontrado.');

    if (driverId && order.fulfillmentType !== 'delivery') {
      throw new BadRequestException('Somente pedidos de entrega podem receber entregador.');
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

    return this.mapOrderToDispatchItem(refreshed);
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
