import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {} from '@prisma/client';
import { CashService } from '../cash/cash.service';
import { CustomerService } from '../crm/customer.service';
import { CashbackService } from '../promotions/cashback.service';
import { TheoreticalStockService } from '../inventory/theoretical-stock.service';
import { CheckoutValidatorService } from '../orders/checkout-validator.service';
import { generatePublicTrackingToken } from '../common/utils/tracking-token.util';
import { KdsService } from '../kds/kds.service';

import type {
  CreatePosOrderDTO,
  OrderResponseDTO,
  PosOrderListItemDTO,
  OrderStatus,
  PaymentMethod,
  ValidatedLine,
} from '@gestor/types';

import { PosFulfillmentType } from '@gestor/types';

@Injectable()
export class PosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checkoutValidator: CheckoutValidatorService,
    private readonly cashService: CashService,
    private readonly customerService: CustomerService,
    private readonly cashbackService: CashbackService,
    private readonly theoreticalStockService: TheoreticalStockService,
    private readonly kdsService: KdsService,
  ) {}

  // ----------------------------------------------------------------
  // CREATE POS SALE (Finalize)
  // ----------------------------------------------------------------
  async createSale(
    tenantId: string,
    operatorId: string,
    dto: CreatePosOrderDTO & { id?: string; waiterId?: string },
    hasDiscountPermission: boolean,
  ): Promise<OrderResponseDTO> {
    const activeSession = await this.prisma.cashSession.findFirst({
      where: { tenantId, operatorId, status: 'open' },
    });

    if (!activeSession) {
      throw new BadRequestException('É necessário ter um caixa aberto para criar vendas no PDV.');
    }

    const discountTotal = dto.discountTotal || 0;
    if (discountTotal > 0 && !hasDiscountPermission) {
      throw new ForbiddenException('Você não tem permissão para aplicar descontos no PDV.');
    }

    // If we're finalizing a DRAFT, we check if it already has a waiter
    let draftWaiterId: string | null = null;
    if (dto.id) {
       const draft = await this.prisma.order.findUnique({ where: { id: dto.id, tenantId }, select: { waiterId: true } });
       if (draft) draftWaiterId = draft.waiterId;
    }

    // If not finalizing a DRAFT, idempotency check.
    if (!dto.id) {
       const existingOrder = await this.prisma.order.findFirst({
         where: { tenantId, idempotencyKey: dto.idempotencyKey },
       });
       if (existingOrder) return this.getOrderDetail(existingOrder.id, tenantId);
    }

    let customerId: string | null = null;
    if (dto.customerPhone) {
      const cust = await this.customerService.syncCustomerOnOrderUpsert(
        tenantId,
        dto.customerPhone,
        dto.customerName || 'Consumidor',
        undefined
      );
      if (cust) customerId = cust.id;
    }

    const validation = await this.checkoutValidator.validateByTenantId(tenantId, dto.items, {
      customerId,
      couponCode: dto.couponCode,
      useCashbackAmount: dto.useCashbackAmount,
    });
    const { lines, itemsSubtotal, discountTotal: commercialDiscountTotal, couponId, cashbackUsed } = validation;

    const manualDiscountTotal = discountTotal;
    const finalItemsTotal = Math.round((itemsSubtotal - (commercialDiscountTotal || 0)) * 100) / 100;
    
    if (manualDiscountTotal > finalItemsTotal) {
      throw new BadRequestException('Desconto manual excede subtotal.');
    }
    const finalTotal = Math.round((finalItemsTotal - manualDiscountTotal) * 100) / 100;
    const combinedDiscountTotal = (commercialDiscountTotal || 0) + manualDiscountTotal;

    const order = await this.prisma.$transaction(async (tx) => {
      let currentOrder;
      const deliveryFee = dto.deliveryFee || 0;
      const orderTotal = Math.round((finalTotal + deliveryFee) * 100) / 100;

      if (dto.id) {
        // Updating existing draft to confirmed
        await tx.orderItem.deleteMany({ where: { orderId: dto.id, tenantId } });
        currentOrder = await tx.order.update({
          where: { id: dto.id },
          data: {
            status: 'confirmed',
            itemsSubtotal,
            discountTotal: combinedDiscountTotal,
            deliveryFee,
            total: orderTotal,
            paymentMethod: dto.paymentMethod,
            cashSessionId: activeSession.id,
            notes: dto.notes || null,
            waiterId: draftWaiterId || dto.waiterId || null,
            tableNumber: dto.tableNumber || undefined,
          }
        });
      } else {
        const updatedTenant = await tx.tenant.update({
          where: { id: tenantId },
          data: { orderSequence: { increment: 1 } },
          select: { orderSequence: true },
        });

        currentOrder = await tx.order.create({
          data: {
            tenantId,
            orderNumber: `#${updatedTenant.orderSequence.toString().padStart(4, '0')}`,
            status: 'confirmed',
            fulfillmentType: dto.fulfillmentType,
            customerName: dto.customerName || 'Consumidor',
            customerPhone: dto.customerPhone || '',
            itemsSubtotal,
            discountTotal: combinedDiscountTotal,
            deliveryFee,
            total: orderTotal,
            sourceChannel: 'pos',
            idempotencyKey: dto.idempotencyKey,
            notes: dto.notes || null,
            paymentMethod: dto.paymentMethod,
            cashSessionId: activeSession.id,
            customerId,
            waiterId: dto.waiterId || null,
            tableNumber: dto.tableNumber || null,
            couponId,
            cashbackUsed,
            publicTrackingToken: generatePublicTrackingToken(),
          },
        });
      }

      // Re-create items snapshots
      for (const line of lines) {
        const productId = line.lineType === 'product' ? (line as ValidatedLine & { productId: string }).productId : null;
        const comboId = line.lineType === 'combo' ? (line as ValidatedLine & { comboId: string }).comboId : null;

        await tx.orderItem.create({
          data: {
            orderId: currentOrder.id,
            tenantId,
            lineType: line.lineType,
            productId,
            comboId,
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
      }

      // Free table if linked
      if (dto.fulfillmentType === 'table' && dto.tableNumber) {
        const table = await tx.dineInTable.findFirst({ where: { tenantId, name: dto.tableNumber } });
        if (table) {
          await tx.dineInTable.update({
            where: { id: table.id },
            data: { status: 'free', activeOrderId: null }
          });
        }
      }

      await tx.orderTimeline.create({
        data: {
          orderId: currentOrder.id,
          tenantId,
          status: 'confirmed',
          note: 'Venda finalizada via PDV.',
          actorId: operatorId,
          actorType: 'tenant_user',
        },
      });

      // Trigger production jobs for open command
      await this.kdsService.createProductionJobs(currentOrder.id).catch(e => {
        console.error('KDS print jobs failed to create for draft', e);
      });

      return currentOrder;
    });

    if (!dto.paymentMethod) {
      throw new BadRequestException('Forma de pagamento é obrigatória para finalizar a venda.');
    }

    await this.cashService.registerSaleMovement(tenantId, activeSession.id, order.id, Number(order.total), dto.paymentMethod);
    if (cashbackUsed && customerId) {
      await this.cashbackService.createTransaction({
        tenantId, customerId, type: 'used', amount: cashbackUsed, orderId: order.id, 
        description: `Usado no PDV, pedido ${order.orderNumber}`
      });
    }
    if (couponId) {
      await this.prisma.coupon.update({ where: { id: couponId }, data: { usedCount: { increment: 1 } } });
    }
    await this.theoreticalStockService.processOrderDepletion(tenantId, order.id);

    return this.getOrderDetail(order.id, tenantId);
  }

  // ----------------------------------------------------------------
  // UPSERT DRAFT SALE (Open Command)
  // ----------------------------------------------------------------
  async upsertDraftSale(
    tenantId: string,
    operatorId: string,
    dto: CreatePosOrderDTO & { id?: string; waiterId?: string },
  ): Promise<OrderResponseDTO> {
    const isUpdate = !!dto.id;
    let customerId: string | null = null;
    if (dto.customerPhone) {
      const cust = await this.customerService.syncCustomerOnOrderUpsert(
        tenantId, dto.customerPhone, dto.customerName || 'Consumidor', undefined
      );
      if (cust) customerId = cust.id;
    }

    const validation = await this.checkoutValidator.validateByTenantId(tenantId, dto.items, { customerId, couponCode: dto.couponCode });
    const { lines, itemsSubtotal, discountTotal, couponId } = validation;

    const order = await this.prisma.$transaction(async (tx) => {
      let currentOrder;
      const finalDiscount = (discountTotal || 0) + (dto.discountTotal || 0);

      if (isUpdate) {
        await tx.orderItem.deleteMany({ where: { orderId: dto.id, tenantId } });
        currentOrder = await tx.order.update({
          where: { id: dto.id },
          data: {
            itemsSubtotal,
            discountTotal: finalDiscount,
            total: Math.round((Number(itemsSubtotal) - finalDiscount) * 100) / 100,
            customerName: dto.customerName || 'Consumidor',
            customerPhone: dto.customerPhone || '',
            notes: dto.notes || null,
            tableNumber: dto.tableNumber || undefined,
            fulfillmentType: (dto.fulfillmentType as any) || undefined,
          }
        });
      } else {
        const updatedTenant = await tx.tenant.update({
          where: { id: tenantId },
          data: { orderSequence: { increment: 1 } },
          select: { orderSequence: true },
        });

        currentOrder = await tx.order.create({
          data: {
            tenantId,
            orderNumber: `#${updatedTenant.orderSequence.toString().padStart(4, '0')}`,
            status: 'draft',
            fulfillmentType: dto.fulfillmentType,
            customerName: dto.customerName || 'Consumidor',
            customerPhone: dto.customerPhone || '',
            itemsSubtotal,
            discountTotal: finalDiscount,
            total: Math.round((Number(itemsSubtotal) - finalDiscount) * 100) / 100,
            sourceChannel: 'pos',
            idempotencyKey: dto.idempotencyKey,
            notes: dto.notes || null,
            customerId,
            waiterId: dto.waiterId || operatorId, // Default to current operator if not specified
            couponId,
            publicTrackingToken: generatePublicTrackingToken(),
          }
        });
      }

      for (const line of lines) {
        const productId = (line as ValidatedLine & { productId?: string }).productId || null;
        const comboId = (line as ValidatedLine & { comboId?: string }).comboId || null;

        await tx.orderItem.create({
          data: {
            orderId: currentOrder.id,
            tenantId,
            lineType: line.lineType,
            productId,
            comboId,
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
      }

      if (dto.fulfillmentType === 'table' && dto.tableNumber) {
        const table = await tx.dineInTable.findFirst({ where: { tenantId, name: dto.tableNumber } });
        if (table) {
          // Safety check: if table is occupied by ANOTHER order, don't just overwrite
          if (table.activeOrderId && table.activeOrderId !== currentOrder.id) {
            throw new BadRequestException(`A mesa ${dto.tableNumber} já está ocupada por outro atendimento ativo.`);
          }
          await tx.dineInTable.update({
            where: { id: table.id },
            data: { status: 'occupied', activeOrderId: currentOrder.id }
          });
        }
      }

      // Trigger production jobs for open command
      await this.kdsService.createProductionJobs(currentOrder.id).catch(e => {
        console.error('KDS print jobs failed to create for draft', e);
      });

      return currentOrder;
    });

    return this.getOrderDetail(order.id, tenantId);
  }

  // ----------------------------------------------------------------
  // GET SALON TABLES
  // ----------------------------------------------------------------
  async getSalonTables(tenantId: string) {
    return this.prisma.dineInTable.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: {
        order: {
          select: {
            id: true,
            total: true,
            customerName: true,
            createdAt: true,
            waiterId: true,
            waiter: {
              select: { name: true }
            }
          }
        }
      }
    });
  }

  // ----------------------------------------------------------------
  // REQUEST BILL (Pré-fechamento)
  // ----------------------------------------------------------------
  async requestBill(tenantId: string, tableId: string, actorId?: string): Promise<void> {
    const table = await this.prisma.dineInTable.findUnique({
      where: { id: tableId, tenantId }
    });
    if (!table || table.status === 'free') {
      throw new BadRequestException('Mesa não encontrada ou já está livre.');
    }

    await this.prisma.dineInTable.update({
      where: { id: tableId },
      data: { status: 'waiting_bill' }
    });

    if (table.activeOrderId) {
      await this.prisma.orderTimeline.create({
        data: {
          orderId: table.activeOrderId,
          tenantId,
          status: 'confirmed',
          note: 'Solicitação de fechamento (Conta pedida).',
          actorId,
          actorType: 'tenant_user',
        }
      });
    }
  }

  // ----------------------------------------------------------------
  // TRANSFER TABLE
  // ----------------------------------------------------------------
  async transferTable(tenantId: string, sourceTableId: string, targetTableId: string, actorId?: string): Promise<void> {
    const [source, target] = await Promise.all([
      this.prisma.dineInTable.findUnique({ where: { id: sourceTableId, tenantId } }),
      this.prisma.dineInTable.findUnique({ where: { id: targetTableId, tenantId } }),
    ]);

    if (!source || source.status === 'free' || !source.activeOrderId) {
      throw new BadRequestException('Mesa de origem não possui atendimento ativo.');
    }
    if (!target || target.status !== 'free') {
      throw new BadRequestException('Mesa de destino deve estar livre.');
    }

    await this.prisma.$transaction([
      this.prisma.dineInTable.update({
        where: { id: sourceTableId },
        data: { status: 'free', activeOrderId: null }
      }),
      this.prisma.dineInTable.update({
        where: { id: targetTableId },
        data: { status: source.status, activeOrderId: source.activeOrderId }
      }),
      this.prisma.orderTimeline.create({
        data: {
          orderId: source.activeOrderId,
          tenantId,
          status: 'confirmed',
          note: `Transferência de mesa: ${source.name} -> ${target.name}`,
          actorId,
          actorType: 'tenant_user',
        }
      })
    ]);
  }

  // ----------------------------------------------------------------
  // LIST POS SALES
  // ----------------------------------------------------------------
  async listPosSales(
    tenantId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: PosOrderListItemDTO[]; total: number }> {
    const where = { tenantId, sourceChannel: 'pos' };

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.order.count({ where }),
    ]);

    const data: PosOrderListItemDTO[] = orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status as string,
      fulfillmentType: o.fulfillmentType as string,
      customerName: o.customerName,
      paymentMethod: (o.paymentMethod as string) || '',
      total: Number(o.total),
      discountTotal: Number(o.discountTotal),
      sourceChannel: o.sourceChannel,
      createdAt: o.createdAt.toISOString(),
    }));

    return { data, total };
  }

  // ----------------------------------------------------------------
  // CANCEL POS SALE
  // ----------------------------------------------------------------
  async cancelPosSale(
    tenantId: string,
    orderId: string,
    operatorId: string,
  ): Promise<OrderResponseDTO> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId, sourceChannel: 'pos' },
    });

    if (!order) throw new BadRequestException('Venda PDV não encontrada.');
    if (order.status === 'cancelled' || order.status === 'completed') {
      throw new ConflictException('Esta venda já está cancelada ou foi finalizada.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({ where: { id: orderId }, data: { status: 'cancelled' } });
      
      // If it's a table order, free it
      if (order.fulfillmentType === 'table') {
        await tx.dineInTable.updateMany({
           where: { tenantId, activeOrderId: orderId },
           data: { status: 'free', activeOrderId: null }
        });
      }

      await tx.orderTimeline.create({
        data: {
          orderId,
          tenantId,
          status: 'cancelled',
          note: 'Venda cancelada via PDV.',
          actorId: operatorId,
          actorType: 'tenant_user',
        },
      });
    });

    if (order.cashSessionId && order.status !== 'draft') {
      await this.cashService.registerRefundMovement(tenantId, order.cashSessionId, orderId, Number(order.total));
    }
    await this.theoreticalStockService.reverseOrderDepletion(tenantId, orderId);

    return this.getOrderDetail(orderId, tenantId);
  }

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
        timeline: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!order) throw new BadRequestException('Pedido não encontrado.');

    return {
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status as OrderStatus,
      fulfillmentType: order.fulfillmentType as PosFulfillmentType,
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
      paymentMethod: order.paymentMethod as PaymentMethod,
      changeFor: order.changeFor ? Number(order.changeFor) : null,
      customerId: order.customerId,
      waiterId: order.waiterId,
      tableNumber: order.tableNumber,
      couponId: order.couponId,
      cashbackUsed: order.cashbackUsed ? Number(order.cashbackUsed) : null,
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
            neighborhood: order.deliveryAddress.neighborhood,
            city: order.deliveryAddress.city,
            state: order.deliveryAddress.state,
            zipCode: order.deliveryAddress.zipCode,
            complement: order.deliveryAddress.complement || undefined,
            reference: order.deliveryAddress.reference || undefined,
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
}
