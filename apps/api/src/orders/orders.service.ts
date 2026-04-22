import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '@prisma/client';
import { CheckoutValidatorService } from './checkout-validator.service';
import { CustomerService } from '../crm/customer.service';
import { CashbackService } from '../promotions/cashback.service';
import { TheoreticalStockService } from '../inventory/theoretical-stock.service';
import { PaymentGatewayService } from '../payment-gateway/payment-gateway.service';
import type {
  CreateOrderDTO,
  OrderResponseDTO,
  OrderListItemDTO,
  UpdateOrderStatusDTO,
  OrderStatus,
  OrderBoardItemDTO,
  OrderKdsItemDTO,
  OrderDispatchItemDTO,
  PaymentMethod,
  ValidatedLine,
} from '@gestor/types';
import { ORDER_STATUS_TRANSITIONS } from '@gestor/types';
import { generatePublicTrackingToken } from '../common/utils/tracking-token.util';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger('OrdersService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly checkoutValidator: CheckoutValidatorService,
    private readonly customerService: CustomerService,
    private readonly cashbackService: CashbackService,
    private readonly inventoryService: TheoreticalStockService,
    private readonly paymentGatewayService: PaymentGatewayService,
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

    // 1. Validate everything server-side
    const validation = await this.checkoutValidator.validate(slug, dto.items, {
      customerId,
      couponCode: dto.couponCode,
      useCashbackAmount: dto.useCashbackAmount,
      deliveryAddress: dto.deliveryAddress,
      payment: dto.payment,
      channel: dto.fulfillmentType === 'delivery' ? 'storefront_delivery' : 'storefront_pickup',
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
            sourceChannel: 'storefront',
            idempotencyKey: dto.idempotencyKey,
            notes: dto.notes || null,
            customerId,
            couponId,
            cashbackUsed,
            paymentMethod: dto.payment.method as any, 
            changeFor: dto.payment.changeFor || null,
            publicTrackingToken: generatePublicTrackingToken(),
          },
        });

        // Create order items
        for (const line of lines) {
          const snapshotCatalogV2Json = (line as ValidatedLine & { snapshotCatalogV2Json?: unknown })
            .snapshotCatalogV2Json as Prisma.InputJsonValue | undefined;

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
              sourceUpsellId: (line as any).sourceUpsellId || null,
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
                    complementItemId: (c as any).itemId || (c as any).complementItemId || '',
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
                    comboBlockItemId: (s as any).blockItemId || (s as any).comboBlockItemId || '',
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
            note: 'Pedido recebido via storefront.',
          },
        });

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

    const orderDetail = await this.getOrderDetail(order.id, tenantId);
    
    // Se pagamento for PIX, gerar QR code
    if (dto.payment.method === 'pix') {
      try {
        const pixPayment = await this.paymentGatewayService.createPixPayment(
          order.id,
          dto.customerEmail || '',
          dto.customerName
        );
        
        return {
          ...orderDetail,
          pixPayment,
        } as any; // Type assertion para incluir campo opcional
      } catch (error) {
        this.logger.error(`Error creating PIX payment: ${(error as any).message}`);
        // Não falhar o pedido, apenas logar erro
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
        paymentMethod: o.paymentMethod as PaymentMethod,
        createdAt: o.createdAt.toISOString(),
      })),
      total,
    };
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
        paymentMethod: o.paymentMethod as PaymentMethod,
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
      paymentMethod: order.paymentMethod as PaymentMethod,
      changeFor: order.changeFor ? Number(order.changeFor) : null,
      customerId: order.customerId,
      couponId: order.couponId,
      cashbackUsed: order.cashbackUsed ? Number(order.cashbackUsed) : null,
      items: order.items.map((item) => ({
        id: item.id,
        lineType: item.lineType as any,
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
}
