import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '@prisma/client';
import { CashService } from '../cash/cash.service';
import { CustomerService } from '../crm/customer.service';
import { CashbackService } from '../promotions/cashback.service';
import { TheoreticalStockService } from '../inventory/theoretical-stock.service';
import { CheckoutValidatorService } from '../orders/checkout-validator.service';
import { generatePublicTrackingToken } from '../common/utils/tracking-token.util';

import type {
  CreatePosOrderDTO,
  OrderResponseDTO,
  PosOrderListItemDTO,
  OrderStatus,
  PaymentMethod,
  ValidatedLine,
} from '@gestor/types';

@Injectable()
export class PosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checkoutValidator: CheckoutValidatorService,
    private readonly cashService: CashService,
    private readonly customerService: CustomerService,
    private readonly cashbackService: CashbackService,
    private readonly theoreticalStockService: TheoreticalStockService,
  ) {}

  // ----------------------------------------------------------------
  // CREATE POS SALE
  // ----------------------------------------------------------------
  async createSale(
    tenantId: string,
    operatorId: string,
    dto: CreatePosOrderDTO,
    hasDiscountPermission: boolean,
  ): Promise<OrderResponseDTO> {
    // 1. Enforce open cash session for this operator
    const activeSession = await this.prisma.cashSession.findFirst({
      where: { tenantId, operatorId, status: 'open' },
    });

    if (!activeSession) {
      throw new BadRequestException(
        'É necessário ter um caixa aberto para criar vendas no PDV. Abra o caixa primeiro.',
      );
    }

    // 2. Server-side discount validation
    const discountTotal = dto.discountTotal || 0;
    if (discountTotal > 0 && !hasDiscountPermission) {
      throw new ForbiddenException(
        'Você não tem permissão para aplicar descontos no PDV.',
      );
    }

    // 3. Idempotency check
    const existingOrder = await this.prisma.order.findUnique({
      where: {
        tenantId_idempotencyKey: { tenantId, idempotencyKey: dto.idempotencyKey },
      },
    });

    if (existingOrder) {
      return this.getOrderDetail(existingOrder.id, tenantId);
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

    // 4. Validate items server-side (reuse checkout validator, skip sellableOnline)
    const validation = await this.checkoutValidator.validateByTenantId(tenantId, dto.items, {
      customerId,
      couponCode: dto.couponCode,
      useCashbackAmount: dto.useCashbackAmount,
    });
    const { lines, itemsSubtotal, discountTotal: commercialDiscountTotal, couponId, cashbackUsed } = validation;

    // 5. Apply discount (server validated commercial + manual POS)
    const manualDiscountTotal = discountTotal; // renamed from destructuring
    const finalItemsTotal = Math.round((itemsSubtotal - (commercialDiscountTotal || 0)) * 100) / 100;
    
    if (manualDiscountTotal > finalItemsTotal) {
      throw new BadRequestException('Desconto manual não pode exceder o subtotal após abatimentos comerciais.');
    }
    const finalTotal = Math.round((finalItemsTotal - manualDiscountTotal) * 100) / 100;
    const combinedDiscountTotal = (commercialDiscountTotal || 0) + manualDiscountTotal;

    // 6. Transactional order creation
    const order = await this.prisma.$transaction(async (tx) => {
      // Atomic order number
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
          status: 'confirmed', // POS sales skip 'pending' — they are immediately confirmed
          fulfillmentType: dto.fulfillmentType,
          customerName: dto.customerName || 'Consumidor',
          customerPhone: dto.customerPhone || '',
          itemsSubtotal,
          discountTotal: combinedDiscountTotal,
          deliveryFee: 0,
          serviceFee: 0,
          total: finalTotal,
          sourceChannel: 'pos',
          idempotencyKey: dto.idempotencyKey,
          notes: dto.notes || null,
          paymentMethod: dto.paymentMethod,
          cashSessionId: activeSession.id,
          customerId,
          couponId,
          cashbackUsed,
          publicTrackingToken: generatePublicTrackingToken(),
        },
      });

      // Create order items (same as storefront)
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
          },
        });

        const hasV2Snapshot = !!(line as ValidatedLine & { snapshotCatalogV2Json?: unknown }).snapshotCatalogV2Json;

        if (!hasV2Snapshot) {
          // LEGACY FALLBACK
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
      }

      // Timeline entry
      await tx.orderTimeline.create({
        data: {
          orderId: newOrder.id,
          tenantId,
          status: 'confirmed',
          note: 'Venda registrada via PDV.',
          actorId: operatorId,
          actorType: 'tenant_user',
        },
      });

      return newOrder;
    });

    // 7. Register sale movement in cash session
    await this.cashService.registerSaleMovement(
      tenantId,
      activeSession.id,
      order.id,
      finalTotal,
      dto.paymentMethod,
    );

    // 8. Update Cashback Ledger & Coupon Usage
    if (cashbackUsed && customerId) {
      await this.cashbackService.createTransaction({
        tenantId,
        customerId: customerId,
        type: 'redeemed',
        amount: cashbackUsed,
        orderId: order.id,
        description: `Usado no PDV, pedido ${order.orderNumber}`
      });
    }

    if (couponId) {
      await this.prisma.coupon.update({
        where: { id: couponId },
        data: { usedCount: { increment: 1 } }
      });
    }

    // 9. Trigger theoretical stock depletion
    await this.theoreticalStockService.processOrderDepletion(tenantId, order.id);

    return this.getOrderDetail(order.id, tenantId);
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
  // CANCEL POS SALE (with refund movement)
  // ----------------------------------------------------------------
  async cancelPosSale(
    tenantId: string,
    orderId: string,
    operatorId: string,
  ): Promise<OrderResponseDTO> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId, sourceChannel: 'pos' },
    });

    if (!order) {
      throw new BadRequestException('Venda PDV não encontrada.');
    }

    if (order.status === 'cancelled' || order.status === 'completed') {
      throw new ConflictException('Esta venda já está cancelada ou foi finalizada.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'cancelled' },
      });

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

    // Register refund in cash session if linked
    if (order.cashSessionId) {
      await this.cashService.registerRefundMovement(
        tenantId,
        order.cashSessionId,
        orderId,
        Number(order.total),
      );
    }

    // Register stock reversal
    await this.theoreticalStockService.reverseOrderDepletion(tenantId, orderId);

    return this.getOrderDetail(orderId, tenantId);
  }

  // ----------------------------------------------------------------
  // HELPER: Get order detail (reuse from orders service logic)
  // ----------------------------------------------------------------
  private async getOrderDetail(orderId: string, tenantId: string): Promise<OrderResponseDTO> {
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

    if (!order) {
      throw new BadRequestException('Pedido não encontrado.');
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
      paymentMethod: order.paymentMethod as PaymentMethod,
      changeFor: order.changeFor ? Number(order.changeFor) : null,
      customerId: order.customerId,
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
}
