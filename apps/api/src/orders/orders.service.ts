import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
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
  UpdateOrderStatusDTO,
  OrderBoardItemDTO,
  OrderKdsItemDTO,
  OrderDispatchItemDTO,
  ValidatedLine,
} from '@gestor/types';
import { ORDER_STATUS_TRANSITIONS } from '@gestor/types';
import { generatePublicTrackingToken } from '../common/utils/tracking-token.util';
import { OrdersGateway } from './orders.gateway';

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
    private readonly whatsappService: WhatsappService,
    private readonly ordersGateway: OrdersGateway,
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
    const { tenantId, lines, itemsSubtotal, discountTotal, deliveryFee, total, couponId, cashbackUsed } = validation;

    this.logger.debug(
      `createOrder: fulfillmentType=${dto.fulfillmentType} hasAddress=${!!dto.deliveryAddress}`,
    );

    // 2. Check delivery address required for delivery
    if (dto.fulfillmentType === 'delivery' && !dto.deliveryAddress) {
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
    this.ordersGateway.emitNewOrder(tenantId, orderDetail);
    
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
  ): Promise<{ items: OrderListItemDTO[]; total: number }> {
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      tenantId,
      ...(status ? { status } : {}),
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

  async updateOrderStatus(id: string, tenantId: string, dto: UpdateOrderStatusDTO) {
    const order = await this.prisma.order.findFirst({
      where: { id, tenantId },
    });

    if (!order) throw new NotFoundException('Pedido não encontrado.');

    const currentStatus = order.status as OrderStatus;
    const nextStatus = dto.status;

    if (!ORDER_STATUS_TRANSITIONS[currentStatus]?.includes(nextStatus)) {
      throw new BadRequestException(
        `Transição inválida de ${currentStatus} para ${nextStatus}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data: { status: nextStatus },
      });

      await tx.orderTimeline.create({
        data: {
          orderId: id,
          tenantId,
          status: nextStatus,
          note: dto.note || `Status atualizado para ${nextStatus}`,
        },
      });

      // Emitir via Socket para o storefront (tempo real)
      if (order.publicTrackingToken) {
        this.ordersGateway.emitOrderStatusUpdated(order.publicTrackingToken, nextStatus, dto.note);
      }

      // Se for cancelamento, emitir evento específico para o painel administrativo
      if (nextStatus === 'cancelled') {
        this.ordersGateway.emitOrderStatusUpdated(order.publicTrackingToken || '', 'cancelled', dto.note);
        // Também emitimos para o tenant room caso o painel administrativo queira ouvir por lá
        this.ordersGateway.server.to(`tenant:${tenantId}`).emit('orderCancelled', { 
          orderId: id, 
          orderNumber: order.orderNumber 
        });

        // Reverter estoque teórico
        await this.inventoryService.reverseOrderDepletion(tenantId, id).catch(e => {
          this.logger.error(`Erro ao reverter estoque para pedido cancelado ${id}: ${e.message}`);
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
    });

    return orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
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
      total: Number(o.total),
      createdAt: o.createdAt.toISOString(),
    }));
  }

  async assignDriver(tenantId: string, orderId: string, driverId: string | null, actorId?: string) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
    });

    if (!order) throw new NotFoundException('Pedido não encontrado.');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { deliveryDriverId: driverId },
      });

      await tx.orderTimeline.create({
        data: {
          orderId,
          tenantId,
          status: order.status as OrderStatus,
          note: driverId ? `Entregador atribuído.` : `Entregador removido do pedido.`,
          actorId,
        },
      });

      return updated;
    });
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
