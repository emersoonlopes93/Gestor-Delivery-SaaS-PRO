import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CheckoutValidatorService, ValidatedLine } from './checkout-validator.service';
import type {
  CreateOrderDTO,
  OrderResponseDTO,
  OrderListItemDTO,
  UpdateOrderStatusDTO,
  OrderStatus,
} from '@gestor/types';
import { ORDER_STATUS_TRANSITIONS } from '@gestor/types';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checkoutValidator: CheckoutValidatorService,
  ) {}

  // ----------------------------------------------------------------
  // CREATE ORDER (Public checkout)
  // ----------------------------------------------------------------
  async createOrder(slug: string, dto: CreateOrderDTO): Promise<OrderResponseDTO> {
    // 1. Validate everything server-side
    const validation = await this.checkoutValidator.validate(slug, dto.items);
    const { tenantId, lines, itemsSubtotal } = validation;

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

    // 4. Transactional order creation with atomic orderNumber
    const total = itemsSubtotal; // Phase 4: discount/fees are 0

    const order = await this.prisma.$transaction(async (tx) => {
      // Atomic increment of order sequence
      const updatedTenant = await tx.tenant.update({
        where: { id: tenantId },
        data: { orderSequence: { increment: 1 } },
        select: { orderSequence: true },
      });

      const orderNumber = `#${updatedTenant.orderSequence.toString().padStart(4, '0')}`;

      // Create the order
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
          discountTotal: 0,
          deliveryFee: 0,
          serviceFee: 0,
          total,
          sourceChannel: 'storefront',
          idempotencyKey: dto.idempotencyKey,
          notes: dto.notes || null,
        },
      });

      // Create order items
      for (const line of lines) {
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
          },
        });

        // Create complement snapshots
        if (line.lineType === 'product' && 'complements' in line) {
          for (const comp of line.complements) {
            await tx.orderItemComplement.create({
              data: {
                orderItemId: orderItem.id,
                tenantId,
                complementItemId: comp.complementItemId,
                snapshotName: comp.snapshotName,
                snapshotPrice: comp.snapshotPrice,
              },
            });
          }
        }

        // Create combo selection snapshots
        if (line.lineType === 'combo' && 'comboSelections' in line) {
          for (const sel of line.comboSelections) {
            await tx.orderItemComboSelection.create({
              data: {
                orderItemId: orderItem.id,
                tenantId,
                comboBlockItemId: sel.comboBlockItemId,
                snapshotBlockName: sel.snapshotBlockName,
                snapshotProductName: sel.snapshotProductName,
                snapshotAdditionalPrice: sel.snapshotAdditionalPrice,
              },
            });
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

      // Initial timeline entry
      await tx.orderTimeline.create({
        data: {
          orderId: newOrder.id,
          tenantId,
          status: 'pending',
          note: 'Pedido criado via storefront.',
        },
      });

      return newOrder;
    });

    return this.getOrderDetail(order.id, tenantId);
  }

  // ----------------------------------------------------------------
  // LIST ORDERS (Tenant internal)
  // ----------------------------------------------------------------
  async listOrders(
    tenantId: string,
    page: number = 1,
    limit: number = 20,
    status?: OrderStatus,
  ): Promise<{ data: OrderListItemDTO[]; total: number; page: number; limit: number }> {
    const where: Record<string, unknown> = { tenantId };
    if (status) {
      where['status'] = status;
    }

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { items: true } } },
      }),
      this.prisma.order.count({ where }),
    ]);

    const data: OrderListItemDTO[] = orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status as OrderStatus,
      fulfillmentType: o.fulfillmentType as 'delivery' | 'pickup',
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      total: Number(o.total),
      itemCount: o._count.items,
      createdAt: o.createdAt.toISOString(),
    }));

    return { data, total, page, limit };
  }

  // ----------------------------------------------------------------
  // ORDER DETAIL (shared by public confirmation + tenant internal)
  // ----------------------------------------------------------------
  async getOrderDetail(orderId: string, tenantId: string): Promise<OrderResponseDTO> {
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
        timeline: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }

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
      items: order.items.map((item) => ({
        id: item.id,
        lineType: item.lineType as 'product' | 'combo',
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
          snapshotName: c.snapshotName,
          snapshotPrice: Number(c.snapshotPrice),
        })),
        comboSelections: item.comboSelections.map((s) => ({
          id: s.id,
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

  // ----------------------------------------------------------------
  // UPDATE STATUS (Tenant internal)
  // ----------------------------------------------------------------
  async updateOrderStatus(
    orderId: string,
    tenantId: string,
    dto: UpdateOrderStatusDTO,
  ): Promise<OrderResponseDTO> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    const currentStatus = order.status as OrderStatus;
    const validTransitions = ORDER_STATUS_TRANSITIONS[currentStatus];

    if (!validTransitions.includes(dto.status)) {
      throw new ConflictException(
        `Transição inválida: ${currentStatus} → ${dto.status}. Transições permitidas: ${validTransitions.join(', ') || 'nenhuma'}.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: dto.status },
      });

      await tx.orderTimeline.create({
        data: {
          orderId,
          tenantId,
          status: dto.status,
          note: dto.note || null,
        },
      });
    });

    return this.getOrderDetail(orderId, tenantId);
  }
}
