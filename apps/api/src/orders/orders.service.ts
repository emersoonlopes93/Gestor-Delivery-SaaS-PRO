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
  OrderBoardItemDTO,
  OrderKdsItemDTO,
  OrderDispatchItemDTO,
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

    console.log(`DEBUG createOrder: type=${dto.fulfillmentType}, hasAddress=${!!dto.deliveryAddress}`);

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

  // ----------------------------------------------------------------
  // OPERATION: Board (Kanban)
  // ----------------------------------------------------------------
  async getBoardOrders(
    tenantId: string,
    fulfillmentType?: 'delivery' | 'pickup'
  ): Promise<OrderBoardItemDTO[]> {
    const where: any = {
      tenantId,
      status: { notIn: ['completed', 'cancelled'] } // Operational view excludes finished ones by default
    };
    
    if (fulfillmentType) {
      where.fulfillmentType = fulfillmentType;
    }

    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'asc' }, // Oldest first is better for operation
      include: {
        items: {
          select: { quantity: true, snapshotName: true }
        }
      }
    });

    return orders.map(o => {
      // Create items summary like "1x Pizza, 2x Coca"
      const itemsSummary = o.items.map(i => `${i.quantity}x ${i.snapshotName}`).join(', ');
      
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status as OrderStatus,
        fulfillmentType: o.fulfillmentType as 'delivery' | 'pickup',
        customerName: o.customerName,
        total: Number(o.total),
        itemCount: o.items.reduce((sum, i) => sum + i.quantity, 0),
        itemsSummary,
        createdAt: o.createdAt.toISOString(),
      };
    });
  }

  // ----------------------------------------------------------------
  // OPERATION: KDS (Kitchen Display System)
  // ----------------------------------------------------------------
  async getKdsOrders(tenantId: string): Promise<OrderKdsItemDTO[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        tenantId,
        // Only orders that need kitchen attention
        status: { in: ['confirmed', 'preparing'] },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        items: {
          include: {
            complements: true,
            comboSelections: true,
          }
        }
      }
    });

    return orders.map(o => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status as OrderStatus,
      fulfillmentType: o.fulfillmentType as 'delivery' | 'pickup',
      notes: o.notes,
      items: o.items.map(i => ({
        id: i.id,
        quantity: i.quantity,
        notes: i.notes,
        snapshotName: i.snapshotName,
        snapshotComposition: i.snapshotComposition,
        complements: i.complements.map(c => ({
          id: c.id,
          snapshotName: c.snapshotName,
        })),
        comboSelections: i.comboSelections.map(s => ({
          id: s.id,
          snapshotBlockName: s.snapshotBlockName,
          snapshotProductName: s.snapshotProductName,
        })),
      })),
      createdAt: o.createdAt.toISOString(),
    }));
  }

  // ----------------------------------------------------------------
  // OPERATION: Dispatch (Phase 6)
  // ----------------------------------------------------------------
  async getDispatchOrders(tenantId: string): Promise<OrderDispatchItemDTO[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        tenantId,
        fulfillmentType: 'delivery',
        // Show preparing (warning), ready_for_delivery, out_for_delivery
        status: { in: ['preparing', 'ready_for_delivery', 'out_for_delivery'] },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        deliveryAddress: true,
        deliveryDriver: true,
      },
    });

    return orders.map(o => ({
      id: o.id,
      orderNumber: o.orderNumber,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      fulfillmentType: o.fulfillmentType as 'delivery' | 'pickup',
      status: o.status as OrderStatus,
      total: Number(o.total),
      deliveryAddress: o.deliveryAddress ? {
        street: o.deliveryAddress.street,
        number: o.deliveryAddress.number,
        complement: o.deliveryAddress.complement || undefined,
        neighborhood: o.deliveryAddress.neighborhood,
        city: o.deliveryAddress.city,
        state: o.deliveryAddress.state,
        zipCode: o.deliveryAddress.zipCode,
        reference: o.deliveryAddress.reference || undefined,
        lat: o.deliveryAddress.lat || undefined,
        lng: o.deliveryAddress.lng || undefined,
      } : undefined,
      deliveryDriverId: o.deliveryDriverId || undefined,
      deliveryDriverName: o.deliveryDriver?.name,
      createdAt: o.createdAt.toISOString(),
    }));
  }

  async assignDriver(
    tenantId: string,
    orderId: string,
    driverId: string | null,
    actorId?: string
  ): Promise<OrderResponseDTO> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId, tenantId },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado.');
    }

    if (order.fulfillmentType !== 'delivery') {
      throw new BadRequestException('Este pedido não é do tipo delivery.');
    }

    const currentStatus = order.status as OrderStatus;
    // Driver can be assigned during preparing, ready_for_delivery, or even out_for_delivery (re-assign)
    if (!['preparing', 'ready_for_delivery', 'out_for_delivery'].includes(currentStatus)) {
      throw new ConflictException('Status do pedido não permite atribuição de entregador no momento.');
    }

    if (driverId) {
      const driver = await this.prisma.deliveryDriver.findUnique({
        where: { id: driverId, tenantId },
      });
      if (!driver) {
        throw new NotFoundException('Entregador não encontrado.');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { deliveryDriverId: driverId },
      });

      await tx.orderTimeline.create({
        data: {
          orderId,
          tenantId,
          status: currentStatus, // Doesn't change status automatically
          note: driverId ? 'Entregador atribuído ao pedido' : 'Entregador removido do pedido',
          actorId: actorId || null,
          actorType: 'tenant_user',
        },
      });
    });

    return this.getOrderDetail(orderId, tenantId);
  }
}
