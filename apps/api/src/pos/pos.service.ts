import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { OrderStatus, FulfillmentType, PaymentMethod as PrismaPaymentMethod } from '@prisma/client';
import { PaymentMethod as SharedPaymentMethod, OrderStatus as SharedOrderStatus } from '@gestor/types';
import { CashService } from '../cash/cash.service';
import { CustomerService } from '../crm/customer.service';
import { CashbackService } from '../promotions/cashback.service';
import { TheoreticalStockService } from '../inventory/theoretical-stock.service';
import { CheckoutValidatorService } from '../orders/checkout-validator.service';
import { generatePublicTrackingToken } from '../common/utils/tracking-token.util';
import { KdsService } from '../kds/kds.service';
import { PrismaService } from '../database/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { DeliveryRateService } from '../delivery/delivery-rate.service';

import type {
  CreatePosOrderDTO,
  DeliveryAddressDTO,
  OrderResponseDTO,
  PosOrderListItemDTO,
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
    private readonly ordersService: OrdersService,
    private readonly deliveryRateService: DeliveryRateService,
  ) {}

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

  private mapPosFulfillment(f: string | undefined): FulfillmentType {
    if (f === 'pickup') return FulfillmentType.pickup;
    if (f === 'table') return FulfillmentType.table;
    if (f === 'dine_in') return FulfillmentType.dine_in;
    return FulfillmentType.delivery;
  }

  private hasText(value: string | undefined | null): boolean {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private normalizeDeliveryAddress(dto: CreatePosOrderDTO, sourceAddress = dto.deliveryAddress): DeliveryAddressDTO | null {
    if (dto.fulfillmentType !== PosFulfillmentType.DELIVERY) return null;

    const address = sourceAddress;
    if (!address) {
      throw new BadRequestException('Endereco de entrega e obrigatorio para venda delivery.');
    }

    if (!this.hasText(dto.customerName) || !this.hasText(dto.customerPhone)) {
      throw new BadRequestException('Cliente e telefone sao obrigatorios para venda delivery.');
    }

    if (!this.hasText(address.street) || !this.hasText(address.number) || !this.hasText(address.neighborhood)) {
      throw new BadRequestException('Rua, numero e bairro sao obrigatorios para venda delivery.');
    }

    return {
      street: address.street.trim(),
      number: address.number.trim(),
      neighborhood: address.neighborhood.trim(),
      city: this.hasText(address.city) ? address.city.trim() : 'Nao informado',
      state: this.hasText(address.state) ? address.state.trim().slice(0, 2).toUpperCase() : 'NA',
      zipCode: this.hasText(address.zipCode) ? address.zipCode.trim() : '00000000',
      complement: this.hasText(address.complement) ? address.complement.trim() : undefined,
      reference: this.hasText(address.reference) ? address.reference.trim() : undefined,
      lat: address.lat,
      lng: address.lng,
    };
  }

  private mapSavedAddressToDeliveryAddress(address: {
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
    complement: string | null;
    reference: string | null;
    lat: number | null;
    lng: number | null;
  }): DeliveryAddressDTO {
    return {
      street: address.street,
      number: address.number,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      zipCode: address.zipCode,
      complement: address.complement || undefined,
      reference: address.reference || undefined,
      lat: address.lat || undefined,
      lng: address.lng || undefined,
    };
  }

  private async resolveCustomerId(tenantId: string, dto: CreatePosOrderDTO): Promise<string | null> {
    if (dto.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, tenantId },
        select: { id: true },
      });
      if (!customer) {
        throw new BadRequestException('Cliente selecionado nao pertence a este tenant ou nao existe.');
      }
      return customer.id;
    }

    if (!dto.customerPhone) return null;

    const cust = await this.customerService.syncCustomerOnOrderUpsert(
      tenantId,
      dto.customerPhone,
      dto.customerName || 'Consumidor',
      undefined
    );
    return cust?.id || null;
  }

  private assertCustomerForFinalSale(dto: CreatePosOrderDTO): void {
    if (!this.hasText(dto.customerName) || !this.hasText(dto.customerPhone)) {
      throw new BadRequestException('Nome do cliente e telefone sao obrigatorios para fechar a conta.');
    }
  }

  private async resolveDeliveryAddress(
    tenantId: string,
    dto: CreatePosOrderDTO,
    customerId: string | null,
  ): Promise<DeliveryAddressDTO | null> {
    if (dto.fulfillmentType !== PosFulfillmentType.DELIVERY) return null;

    if (dto.selectedAddressId) {
      const savedAddress = await this.prisma.customerAddress.findFirst({
        where: {
          id: dto.selectedAddressId,
          tenantId,
          ...(customerId ? { customerId } : {}),
        },
      });

      if (!savedAddress) {
        throw new BadRequestException('Endereco selecionado nao pertence ao cliente ou tenant informado.');
      }

      return this.normalizeDeliveryAddress(
        dto,
        dto.deliveryAddress || this.mapSavedAddressToDeliveryAddress(savedAddress),
      );
    }

    return this.normalizeDeliveryAddress(dto);
  }

  private async resolveDeliveryFee(
    tenantId: string,
    dto: CreatePosOrderDTO,
    address: DeliveryAddressDTO | null,
  ): Promise<number> {
    if (dto.fulfillmentType !== PosFulfillmentType.DELIVERY) return 0;
    const calculation = await this.deliveryRateService.calculateDeliveryFee(tenantId, address);
    return Math.round(calculation.fee * 100) / 100;
  }

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

    if (!dto.paymentMethod) {
      throw new BadRequestException('Forma de pagamento e obrigatoria para finalizar a venda.');
    }

    this.assertCustomerForFinalSale(dto);

    const customerId = await this.resolveCustomerId(tenantId, dto);
    const deliveryAddress = await this.resolveDeliveryAddress(tenantId, dto, customerId);
    const deliveryFee = await this.resolveDeliveryFee(tenantId, dto, deliveryAddress);

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
      const orderTotal = Math.round((finalTotal + deliveryFee) * 100) / 100;

      if (dto.id) {
        // Updating existing draft (keep status as-is for now, will transition via updateOrderStatus)
        await tx.orderItem.deleteMany({ where: { orderId: dto.id, tenantId } });
        currentOrder = await tx.order.update({
          where: { id: dto.id },
          data: {
            itemsSubtotal,
            discountTotal: combinedDiscountTotal,
            deliveryFee,
            total: orderTotal,
            paymentMethod: dto.paymentMethod,
            cashSessionId: activeSession.id,
            customerName: dto.customerName!.trim(),
            customerPhone: dto.customerPhone!.trim(),
            customerId,
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
            status: 'pending',
            fulfillmentType: dto.fulfillmentType,
            customerName: dto.customerName!.trim(),
            customerPhone: dto.customerPhone!.trim(),
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

      if (deliveryAddress) {
        await tx.orderDeliveryAddress.upsert({
          where: { orderId: currentOrder.id },
          create: {
            orderId: currentOrder.id,
            tenantId,
            street: deliveryAddress.street,
            number: deliveryAddress.number,
            neighborhood: deliveryAddress.neighborhood,
            city: deliveryAddress.city,
            state: deliveryAddress.state,
            zipCode: deliveryAddress.zipCode,
            complement: deliveryAddress.complement || null,
            reference: deliveryAddress.reference || null,
            lat: deliveryAddress.lat,
            lng: deliveryAddress.lng,
          },
          update: {
            street: deliveryAddress.street,
            number: deliveryAddress.number,
            neighborhood: deliveryAddress.neighborhood,
            city: deliveryAddress.city,
            state: deliveryAddress.state,
            zipCode: deliveryAddress.zipCode,
            complement: deliveryAddress.complement || null,
            reference: deliveryAddress.reference || null,
            lat: deliveryAddress.lat,
            lng: deliveryAddress.lng,
          },
        });
      } else if (dto.fulfillmentType !== PosFulfillmentType.DELIVERY) {
        await tx.orderDeliveryAddress.deleteMany({
          where: { orderId: currentOrder.id, tenantId },
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

      return currentOrder;
    });

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

    // Transition order to confirmed via centralized OrdersService to ensure timeline, KDS, and WebSocket are properly triggered
    await this.ordersService.updateOrderStatus(order.id, tenantId, {
      status: 'confirmed' as SharedOrderStatus,
      note: 'Venda finalizada via PDV.',
    }, operatorId);

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
            fulfillmentType: this.mapPosFulfillment(dto.fulfillmentType),
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

      return currentOrder;
    });

    await this.kdsService.createProductionJobs(order.id, tenantId);

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
      status: o.status as OrderStatus,
      fulfillmentType: o.fulfillmentType as 'delivery' | 'pickup',
      customerName: o.customerName,
      paymentMethod: o.paymentMethod ? this.mapPaymentMethod(o.paymentMethod) : SharedPaymentMethod.other,
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

    // Utiliza centralizadamente OrdersService.updateOrderStatus para gerenciar a transição de status operacional
    await this.ordersService.updateOrderStatus(
      orderId,
      tenantId,
      {
        status: 'cancelled' as SharedOrderStatus,
        note: 'Venda cancelada via PDV.',
      },
      operatorId,
    );

    // Se for pedido de mesa, liberar a mesa correspondente
    if (order.fulfillmentType === 'table') {
      await this.prisma.dineInTable.updateMany({
         where: { tenantId, activeOrderId: orderId },
         data: { status: 'free', activeOrderId: null }
      });
    }

    if (order.cashSessionId && order.status !== 'draft') {
      await this.cashService.registerRefundMovement(tenantId, order.cashSessionId, orderId, Number(order.total));
    }

    return this.getOrderDetail(orderId, tenantId);
  }

  // ----------------------------------------------------------------
  // TABLE MANAGEMENT
  // ----------------------------------------------------------------
  async createTable(tenantId: string, data: { name: string; capacity: number }) {
    // Check if table with same name exists for this tenant
    const existing = await this.prisma.dineInTable.findFirst({
      where: { tenantId, name: data.name },
    });
    if (existing) {
      throw new ConflictException(`Uma mesa com o nome "${data.name}" já existe.`);
    }

    return this.prisma.dineInTable.create({
      data: {
        tenantId,
        name: data.name,
        capacity: data.capacity,
        status: 'free',
      },
    });
  }

  async deleteTable(tenantId: string, id: string) {
    const table = await this.prisma.dineInTable.findUnique({
      where: { id, tenantId },
    });
    if (!table) throw new BadRequestException('Mesa não encontrada.');
    if (table.status !== 'free') {
      throw new BadRequestException('Não é possível excluir uma mesa ocupada.');
    }

    return this.prisma.dineInTable.delete({
      where: { id },
    });
  }

  async getOrderDetail(orderId: string, tenantId: string): Promise<OrderResponseDTO> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: {
        items: true,
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
      paymentMethod: order.paymentMethod ? this.mapPaymentMethod(order.paymentMethod) : SharedPaymentMethod.other,
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
