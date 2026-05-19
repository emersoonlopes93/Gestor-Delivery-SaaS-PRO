import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';
import { 
  OrderSplitStatus as PrismaOrderSplitStatus, 
  PaymentMethod as PrismaPaymentMethod, 
  PaymentTxStatus as PrismaPaymentTxStatus, 
  Prisma 
} from '@prisma/client';
import { 
  OrderSplitDTO, 
  SplitPaymentDTO, 
  OrderSplitStatus, 
  PaymentMethod, 
  PaymentTxStatus 
} from '@gestor/types';

@Injectable()
export class SplitPaymentService {
  private readonly logger = new Logger(SplitPaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private mapSplitToDTO(
    s: Prisma.OrderSplitGetPayload<{ include: { payments: true } }>,
  ): OrderSplitDTO {
    return {
      ...s,
      splitType: s.splitType as 'items' | 'people' | 'custom',
      status: s.status as OrderSplitStatus,
      subtotalAmount: Number(s.subtotalAmount),
      discountAmount: Number(s.discountAmount),
      serviceFeeAmount: Number(s.serviceFeeAmount),
      deliveryFeeAmount: Number(s.deliveryFeeAmount),
      totalAmount: Number(s.totalAmount),
      confirmedAt: s.confirmedAt || undefined,
      cancelledAt: s.cancelledAt || undefined,
      payments: s.payments.map(p => this.mapPaymentToDTO(p)),
    };
  }

  private mapPaymentToDTO(p: Prisma.SplitPaymentGetPayload<{}>): SplitPaymentDTO {
    return {
      ...p,
      paymentMethod: p.paymentMethod as PaymentMethod,
      amount: Number(p.amount),
      changeFor: p.changeFor ? Number(p.changeFor) : undefined,
    };
  }

  /**
   * Cria uma divisão de conta para um pedido
   */
  async createOrderSplit(data: {
    orderId: string;
    splitType: 'items' | 'people' | 'custom';
    description?: string;
    subtotalAmount: number;
    discountAmount?: number;
    serviceFeeAmount?: number;
    deliveryFeeAmount?: number;
    totalAmount: number;
    responsiblePerson?: string;
    responsiblePhone?: string;
    notes?: string;
  }): Promise<OrderSplitDTO> {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    // Validar pedido
    const order = await this.prisma.order.findFirst({
      where: {
        id: data.orderId,
        tenantId,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Criar divisão
    const orderSplit = await this.prisma.orderSplit.create({
      data: {
        tenantId,
        orderId: data.orderId,
        splitType: data.splitType,
        description: data.description,
        subtotalAmount: data.subtotalAmount,
        discountAmount: data.discountAmount || 0,
        serviceFeeAmount: data.serviceFeeAmount || 0,
        deliveryFeeAmount: data.deliveryFeeAmount || 0,
        totalAmount: data.totalAmount,
        responsiblePerson: data.responsiblePerson,
        responsiblePhone: data.responsiblePhone,
        notes: data.notes,
        status: PrismaOrderSplitStatus.pending,
      },
      include: {
        payments: true,
      },
    });

    this.logger.log(`Created order split ${orderSplit.id} for order ${data.orderId}`);
    
    return this.mapSplitToDTO(orderSplit);
  }

  /**
   * Adiciona um pagamento a uma divisão de conta
   */
  async addPaymentToSplit(data: {
    orderSplitId: string;
    paymentMethod: PaymentMethod;
    amount: number;
    changeFor?: number;
    notes?: string;
  }) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    // Validar split
    const orderSplit = await this.prisma.orderSplit.findFirst({
      where: {
        id: data.orderSplitId,
        tenantId,
      },
      include: {
        payments: true,
      },
    });

    if (!orderSplit) {
      throw new NotFoundException('Order split not found');
    }

    if (orderSplit.status !== PrismaOrderSplitStatus.pending) {
      throw new BadRequestException('Order split is not in pending status');
    }

    // Calcular total já pago
    const paidAmount = orderSplit.payments
      .filter((p) => p.isPaid)
      .reduce((sum, p) => sum + Number(p.amount), 0);

    // Validar valor
    if (paidAmount + data.amount > Number(orderSplit.totalAmount)) {
      throw new BadRequestException('Payment amount exceeds split total');
    }

    // Criar pagamento
    const splitPayment = await this.prisma.splitPayment.create({
      data: {
        tenantId,
        orderSplitId: data.orderSplitId,
        paymentMethod: data.paymentMethod as PrismaPaymentMethod,
        amount: data.amount,
        changeFor: data.changeFor,
        notes: data.notes,
        isPaid: data.paymentMethod === PaymentMethod.cash ? false : true, // Pagamentos em dinheiro precisam confirmação
        paidAt: data.paymentMethod !== PaymentMethod.cash ? new Date() : null,
      },
    });

    // Se for PIX, criar transação de pagamento
    let paymentTransaction = null;
    if (data.paymentMethod === PaymentMethod.pix) {
      const metadata: Prisma.InputJsonObject = {
        orderSplitId: data.orderSplitId,
        splitPaymentId: splitPayment.id,
      };
      paymentTransaction = await this.prisma.paymentTransaction.create({
        data: {
          tenantId,
          orderId: orderSplit.orderId,
          gatewayName: 'mercadopago',
          gatewayTxId: '',
          method: PrismaPaymentMethod.pix,
          amount: data.amount,
          status: PrismaPaymentTxStatus.pending,
          metadata,
        },
      });

      // Atualizar referência da transação
      await this.prisma.splitPayment.update({
        where: { id: splitPayment.id },
        data: { paymentTxId: paymentTransaction.id },
      });
    }

    this.logger.log(`Added payment ${splitPayment.id} to split ${data.orderSplitId}`);

    return {
      splitPayment: this.mapPaymentToDTO(splitPayment),
      paymentTransaction,
    };
  }

  /**
   * Confirma um pagamento em dinheiro
   */
  async confirmCashPayment(splitPaymentId: string): Promise<SplitPaymentDTO> {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    const splitPayment = await this.prisma.splitPayment.findFirst({
      where: {
        id: splitPaymentId,
        tenantId,
      },
    });

    if (!splitPayment) {
      throw new NotFoundException('Split payment not found');
    }

    if (splitPayment.isPaid) {
      throw new BadRequestException('Payment is already confirmed');
    }

    if (splitPayment.paymentMethod !== PrismaPaymentMethod.cash) {
      throw new BadRequestException('Only cash payments can be confirmed manually');
    }

    // Confirmar pagamento
    const updated = await this.prisma.splitPayment.update({
      where: { id: splitPaymentId },
      data: {
        isPaid: true,
        paidAt: new Date(),
      },
    });

    // Verificar se todos os pagamentos do split foram confirmados
    await this.checkSplitCompletion(splitPayment.orderSplitId);

    this.logger.log(`Confirmed cash payment ${splitPaymentId}`);

    return this.mapPaymentToDTO(updated);
  }

  /**
   * Divide um pedido igualmente por um número de pessoas
   */
  async splitByPeople(orderId: string, numberOfPeople: number): Promise<OrderSplitDTO[]> {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new Error('Tenant context not found');

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
    });
    if (!order) throw new NotFoundException('Order not found');

    const total = Number(order.total);
    const amountPerPerson = Math.round((total / numberOfPeople) * 100) / 100;
    const lastPersonAmount = Math.round((total - (amountPerPerson * (numberOfPeople - 1))) * 100) / 100;

    const splits = [];
    for (let i = 0; i < numberOfPeople; i++) {
      const isLast = i === numberOfPeople - 1;
      const split = await this.createOrderSplit({
        orderId,
        splitType: 'people',
        description: `Pessoa ${i + 1} de ${numberOfPeople}`,
        totalAmount: isLast ? lastPersonAmount : amountPerPerson,
        subtotalAmount: isLast ? lastPersonAmount : amountPerPerson,
      });
      splits.push(split);
    }

    return splits;
  }

  /**
   * Divide um pedido por itens específicos
   */
  async splitByItems(orderId: string, items: { orderItemId: string, quantity: number }[]): Promise<OrderSplitDTO> {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new Error('Tenant context not found');

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    // Calcular total dos itens selecionados
    let subtotal = 0;
    for (const selection of items) {
      const orderItem = order.items.find(it => it.id === selection.orderItemId);
      if (!orderItem) throw new BadRequestException(`Item ${selection.orderItemId} not found in order`);
      if (selection.quantity > orderItem.quantity) throw new BadRequestException(`Insufficient quantity for item ${orderItem.snapshotName}`);
      
      const unitPrice = Number(orderItem.unitPrice);
      subtotal += unitPrice * selection.quantity;
    }

    // Criar o split para esses itens
    // Nota: Simplificado para considerar apenas o subtotal por enquanto.
    // Em uma versão real, ratearíamos taxas e descontos do pedido original.
    return this.createOrderSplit({
      orderId,
      splitType: 'items',
      description: 'Divisão por itens',
      totalAmount: subtotal,
      subtotalAmount: subtotal,
    });
  }

  /**
   * Cancela uma divisão de conta
   */
  async cancelOrderSplit(orderSplitId: string, reason?: string): Promise<boolean> {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    const orderSplit = await this.prisma.orderSplit.findFirst({
      where: {
        id: orderSplitId,
        tenantId,
      },
      include: {
        payments: {
          include: {
            paymentTransaction: true,
          },
        },
      },
    });

    if (!orderSplit) {
      throw new NotFoundException('Order split not found');
    }

    if (orderSplit.status === PrismaOrderSplitStatus.cancelled) {
      throw new BadRequestException('Order split is already cancelled');
    }

    // Cancelar transações de pagamento pendentes
    const pendingTransactions = orderSplit.payments
      .filter(p => p.paymentTransaction && !p.isPaid)
      .map(p => p.paymentTransaction!);

    for (const transaction of pendingTransactions) {
      await this.prisma.paymentTransaction.update({
        where: { id: transaction.id },
        data: { status: PrismaPaymentTxStatus.failed },
      });
    }

    // Cancelar split
    await this.prisma.orderSplit.update({
      where: { id: orderSplitId },
      data: {
        status: PrismaOrderSplitStatus.cancelled,
        cancelledAt: new Date(),
        notes: reason ? `${orderSplit.notes || ''}\nCancelado: ${reason}`.trim() : orderSplit.notes,
      },
    });

    this.logger.log(`Cancelled order split ${orderSplitId}`);

    return true;
  }

  /**
   * Lista divisões de um pedido
   */
  async getOrderSplits(orderId: string): Promise<OrderSplitDTO[]> {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    const splits = await this.prisma.orderSplit.findMany({
      where: {
        orderId,
        tenantId,
      },
      include: {
        payments: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return splits.map(s => this.mapSplitToDTO(s));
  }

  /**
   * Lista todas as divisões (admin)
   */
  async getAllOrderSplits(
    status?: OrderSplitStatus,
    page = 1,
    limit = 20,
  ): Promise<{ items: OrderSplitDTO[]; total: number; page: number; limit: number }> {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    const skip = (page - 1) * limit;

    const where: Prisma.OrderSplitWhereInput = { tenantId };
    
    if (status) {
      where.status = status as PrismaOrderSplitStatus;
    }

    const [items, total] = await Promise.all([
      this.prisma.orderSplit.findMany({
        where,
        include: {
          payments: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      this.prisma.orderSplit.count({ where }),
    ]);

    return {
      items: items.map(s => this.mapSplitToDTO(s)),
      total,
      page,
      limit,
    };
  }

  /**
   * Verifica se uma divisão foi completamente paga
   */
  private async checkSplitCompletion(orderSplitId: string) {
    const orderSplit = await this.prisma.orderSplit.findUnique({
      where: { id: orderSplitId },
      include: {
        payments: true,
      },
    });

    if (!orderSplit) {
      return;
    }

    const totalPaid = orderSplit.payments
      .filter(p => p.isPaid)
      .reduce((sum, p) => sum + Number(p.amount), 0);

    if (totalPaid >= Number(orderSplit.totalAmount) && orderSplit.status === PrismaOrderSplitStatus.pending) {
      await this.prisma.orderSplit.update({
        where: { id: orderSplitId },
        data: {
          status: PrismaOrderSplitStatus.confirmed,
          confirmedAt: new Date(),
        },
      });

      this.logger.log(`Order split ${orderSplitId} fully paid and confirmed`);
    }
  }

  /**
   * Calcula resumo dos pagamentos de uma divisão
   */
  async getSplitSummary(orderSplitId: string): Promise<{
    split: OrderSplitDTO;
    summary: {
      totalAmount: number;
      totalPaid: number;
      remainingAmount: number;
      isFullyPaid: boolean;
      paymentCount: number;
      paidCount: number;
      pendingCount: number;
    };
    payments: SplitPaymentDTO[];
  }> {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    const orderSplit = await this.prisma.orderSplit.findFirst({
      where: {
        id: orderSplitId,
        tenantId,
      },
      include: {
        payments: true,
      },
    });

    if (!orderSplit) {
      throw new NotFoundException('Order split not found');
    }

    const totalPaid = orderSplit.payments
      .filter(p => p.isPaid)
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const pendingPayments = orderSplit.payments.filter(p => !p.isPaid);
    const remainingAmount = Number(orderSplit.totalAmount) - totalPaid;

    return {
      split: this.mapSplitToDTO(orderSplit),
      summary: {
        totalAmount: Number(orderSplit.totalAmount),
        totalPaid,
        remainingAmount,
        isFullyPaid: totalPaid >= Number(orderSplit.totalAmount),
        paymentCount: orderSplit.payments.length,
        paidCount: orderSplit.payments.filter(p => p.isPaid).length,
        pendingCount: pendingPayments.length,
      },
      payments: orderSplit.payments.map(p => this.mapPaymentToDTO(p)),
    };
  }

  /**
   * Remove um pagamento de uma divisão (se não estiver confirmado)
   */
  async removePaymentFromSplit(splitPaymentId: string): Promise<boolean> {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    const splitPayment = await this.prisma.splitPayment.findFirst({
      where: {
        id: splitPaymentId,
        tenantId,
      },
      include: {
        paymentTransaction: true,
      },
    });

    if (!splitPayment) {
      throw new NotFoundException('Split payment not found');
    }

    if (splitPayment.isPaid) {
      throw new BadRequestException('Cannot remove confirmed payment');
    }

    // Cancelar transação de pagamento se existir
    if (splitPayment.paymentTransaction) {
      await this.prisma.paymentTransaction.update({
        where: { id: splitPayment.paymentTransaction.id },
        data: { status: PrismaPaymentTxStatus.failed },
      });
    }

    // Remover pagamento
    await this.prisma.splitPayment.delete({
      where: { id: splitPaymentId },
    });

    this.logger.log(`Removed split payment ${splitPaymentId}`);

    return true;
  }
}
