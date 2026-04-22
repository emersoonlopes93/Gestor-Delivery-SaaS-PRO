import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';
import { OrderSplitStatus, PaymentMethod, PaymentTxStatus } from '@prisma/client';

@Injectable()
export class SplitPaymentService {
  private readonly logger = new Logger(SplitPaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

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
  }) {
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
        status: OrderSplitStatus.pending,
      },
      include: {
        order: true,
        payments: true,
      },
    });

    this.logger.log(`Created order split ${orderSplit.id} for order ${data.orderId}`);
    
    return orderSplit;
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
        order: true,
      },
    });

    if (!orderSplit) {
      throw new NotFoundException('Order split not found');
    }

    if (orderSplit.status !== OrderSplitStatus.pending) {
      throw new BadRequestException('Order split is not in pending status');
    }

    // Calcular total já pago
    const paidAmount = orderSplit.payments
      .filter(p => p.isPaid)
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
        paymentMethod: data.paymentMethod,
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
      paymentTransaction = await this.prisma.paymentTransaction.create({
        data: {
          tenantId,
          orderId: orderSplit.orderId,
          gatewayName: 'mercadopago',
          gatewayTxId: '',
          method: PaymentMethod.pix,
          amount: data.amount,
          status: PaymentTxStatus.pending,
          metadata: {
            orderSplitId: data.orderSplitId,
            splitPaymentId: splitPayment.id,
          } as any,
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
      splitPayment,
      paymentTransaction,
    };
  }

  /**
   * Confirma um pagamento em dinheiro
   */
  async confirmCashPayment(splitPaymentId: string) {
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
        orderSplit: true,
      },
    });

    if (!splitPayment) {
      throw new NotFoundException('Split payment not found');
    }

    if (splitPayment.isPaid) {
      throw new BadRequestException('Payment is already confirmed');
    }

    if (splitPayment.paymentMethod !== PaymentMethod.cash) {
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

    return updated;
  }

  /**
   * Cancela uma divisão de conta
   */
  async cancelOrderSplit(orderSplitId: string, reason?: string) {
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

    if (orderSplit.status === OrderSplitStatus.cancelled) {
      throw new BadRequestException('Order split is already cancelled');
    }

    // Cancelar transações de pagamento pendentes
    const pendingTransactions = orderSplit.payments
      .filter(p => p.paymentTransaction && !p.isPaid)
      .map(p => p.paymentTransaction!);

    for (const transaction of pendingTransactions) {
      await this.prisma.paymentTransaction.update({
        where: { id: transaction.id },
        data: { status: PaymentTxStatus.failed },
      });
    }

    // Cancelar split
    await this.prisma.orderSplit.update({
      where: { id: orderSplitId },
      data: {
        status: OrderSplitStatus.cancelled,
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
  async getOrderSplits(orderId: string) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    return this.prisma.orderSplit.findMany({
      where: {
        orderId,
        tenantId,
      },
      include: {
        payments: {
          include: {
            paymentTransaction: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  /**
   * Lista todas as divisões (admin)
   */
  async getAllOrderSplits(
    status?: OrderSplitStatus,
    page = 1,
    limit = 20,
  ) {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    const skip = (page - 1) * limit;

    const where: any = { tenantId };
    
    if (status) {
      where.status = status;
    }

    const [items, total] = await Promise.all([
      this.prisma.orderSplit.findMany({
        where,
        include: {
          order: true,
          payments: {
            include: {
              paymentTransaction: true,
            },
          },
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
      items,
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

    if (totalPaid >= Number(orderSplit.totalAmount) && orderSplit.status === OrderSplitStatus.pending) {
      await this.prisma.orderSplit.update({
        where: { id: orderSplitId },
        data: {
          status: OrderSplitStatus.confirmed,
          confirmedAt: new Date(),
        },
      });

      this.logger.log(`Order split ${orderSplitId} fully paid and confirmed`);
    }
  }

  /**
   * Calcula resumo dos pagamentos de uma divisão
   */
  async getSplitSummary(orderSplitId: string) {
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
        order: true,
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
      split: orderSplit,
      summary: {
        totalAmount: Number(orderSplit.totalAmount),
        totalPaid,
        remainingAmount,
        isFullyPaid: totalPaid >= Number(orderSplit.totalAmount),
        paymentCount: orderSplit.payments.length,
        paidCount: orderSplit.payments.filter(p => p.isPaid).length,
        pendingCount: pendingPayments.length,
      },
      payments: orderSplit.payments,
    };
  }

  /**
   * Remove um pagamento de uma divisão (se não estiver confirmado)
   */
  async removePaymentFromSplit(splitPaymentId: string) {
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
        orderSplit: true,
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
        data: { status: PaymentTxStatus.failed },
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
