import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';
import { PaymentTxStatus, PaymentMethod, OrderStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { WebhookDto } from './dto/create-pix-payment.dto';

interface MercadoPagoConfig {
  accessToken: string;
  publicKey: string;
  webhookUrl: string;
}

interface MercadoPagoPixRequest {
  transaction_amount: number;
  description: string;
  payment_method_id: 'pix';
  payer: {
    email: string;
    first_name?: string;
    last_name?: string;
    identification?: {
      type: string;
      number: string;
    };
  };
  external_reference: string;
}

interface MercadoPagoPixResponse {
  id: string;
  status: string;
  status_detail: string;
  point_of_interaction: {
    transaction_data: {
      qr_code: string;
      qr_code_base64: string;
      ticket_url: string;
    };
  };
}

interface MercadoPagoWebhookPayload {
  action: string;
  api_version: string;
  data: {
    id: string;
  };
  date_created: string;
  id: string;
  live_mode: boolean;
  type: string;
  user_id: string;
}

@Injectable()
export class PaymentGatewayService {
  private readonly logger = new Logger(PaymentGatewayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly configService: ConfigService,
  ) {}

  private getMercadoPagoConfig(): MercadoPagoConfig {
    const accessToken = this.configService.get<string>('MERCADO_PAGO_ACCESS_TOKEN');
    const publicKey = this.configService.get<string>('MERCADO_PAGO_PUBLIC_KEY');
    const webhookUrl = this.configService.get<string>('MERCADO_PAGO_WEBHOOK_URL');

    if (!accessToken || !publicKey || !webhookUrl) {
      throw new Error('Mercado Pago configuration missing');
    }

    return { accessToken, publicKey, webhookUrl };
  }

  async createPixPayment(orderId: string, customerEmail: string, customerName?: string): Promise<{
    transactionId: string;
    qrCode: string;
    qrCodeBase64: string;
    ticketUrl: string;
    expiresAt: Date;
  }> {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }
    
    // Buscar pedido
    const order = await this.prisma.tenantClient.order.findUnique({
      where: { id: orderId },
      include: { customer: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.paymentMethod !== PaymentMethod.pix) {
      throw new BadRequestException('Order payment method is not PIX');
    }

    if (order.status !== OrderStatus.pending) {
      throw new BadRequestException('Order is not in pending status');
    }

    // Criar transação de pagamento
    const paymentTransaction = await this.prisma.tenantClient.paymentTransaction.create({
      data: {
        tenantId,
        orderId,
        gatewayName: 'mercadopago',
        gatewayTxId: '', // Será preenchido após resposta do Mercado Pago
        method: PaymentMethod.pix,
        amount: order.total,
        status: PaymentTxStatus.pending,
        metadata: {
          customerEmail,
          customerName,
          orderNumber: order.orderNumber,
        } as any,
      },
    });

    // Preparar requisição para Mercado Pago
    const config = this.getMercadoPagoConfig();
    const payload: MercadoPagoPixRequest = {
      transaction_amount: Number(order.total),
      description: `Pedido #${order.orderNumber}`,
      payment_method_id: 'pix',
      payer: {
        email: customerEmail,
        first_name: customerName?.split(' ')[0],
        last_name: customerName?.split(' ').slice(1).join(' '),
      },
      external_reference: paymentTransaction.id,
    };

    try {
      // Fazer requisição para Mercado Pago API
      const response = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Mercado Pago API error: ${error}`);
        throw new Error('Failed to create PIX payment');
      }

      const mpResponse: MercadoPagoPixResponse = await response.json();

      // Atualizar transação com ID do gateway
      await this.prisma.tenantClient.paymentTransaction.update({
        where: { id: paymentTransaction.id },
        data: {
          gatewayTxId: mpResponse.id,
          metadata: {
            ...paymentTransaction.metadata as any,
            mercadoPagoResponse: mpResponse,
          },
        },
      });

      // Calcular data de expiração (30 minutos para PIX)
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 30);

      return {
        transactionId: paymentTransaction.id,
        qrCode: mpResponse.point_of_interaction.transaction_data.qr_code,
        qrCodeBase64: mpResponse.point_of_interaction.transaction_data.qr_code_base64,
        ticketUrl: mpResponse.point_of_interaction.transaction_data.ticket_url,
        expiresAt,
      };
    } catch (error) {
      this.logger.error(`Error creating PIX payment: ${(error as any).message}`);
      
      // Marcar transação como falha
      await this.prisma.tenantClient.paymentTransaction.update({
        where: { id: paymentTransaction.id },
        data: {
          status: PaymentTxStatus.failed,
          metadata: {
            ...paymentTransaction.metadata as any,
            error: (error as any).message,
          },
        },
      });

      throw error;
    }
  }

  async processWebhook(payload: WebhookDto): Promise<void> {
    if (payload.type !== 'payment') {
      this.logger.log(`Ignoring webhook type: ${payload.type}`);
      return;
    }

    const config = this.getMercadoPagoConfig();
    
    // Buscar informações do pagamento no Mercado Pago
    try {
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${payload.data.id}`, {
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
        },
      });

      if (!response.ok) {
        this.logger.error(`Failed to fetch payment info: ${await response.text()}`);
        return;
      }

      const payment = await response.json();
      await this.processPaymentUpdate(payment);
    } catch (error) {
      this.logger.error(`Error processing webhook: ${(error as any).message}`);
    }
  }

  private async processPaymentUpdate(payment: any): Promise<void> {
    // Buscar transação pelo external_reference
    const transaction = await this.prisma.paymentTransaction.findFirst({
      where: { gatewayTxId: payment.id.toString() },
      include: { order: true },
    });

    if (!transaction) {
      this.logger.warn(`Transaction not found for payment ${payment.id}`);
      return;
    }

    let newStatus: PaymentTxStatus;
    let orderStatus: OrderStatus;

    switch (payment.status) {
      case 'approved':
        newStatus = PaymentTxStatus.confirmed;
        orderStatus = OrderStatus.confirmed;
        break;
      case 'cancelled':
      case 'rejected':
        newStatus = PaymentTxStatus.failed;
        orderStatus = OrderStatus.cancelled;
        break;
      case 'in_process':
        newStatus = PaymentTxStatus.pending;
        orderStatus = OrderStatus.pending;
        break;
      default:
        this.logger.warn(`Unknown payment status: ${payment.status}`);
        return;
    }

    // Atualizar transação
    await this.prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: newStatus,
        metadata: {
          ...transaction.metadata as any,
          mercadoPagoPayment: payment,
        },
      },
    });

    // Atualizar status do pedido se confirmado
    if (newStatus === PaymentTxStatus.confirmed && transaction.orderId) {
      await this.prisma.order.update({
        where: { id: transaction.orderId },
        data: {
          status: orderStatus,
        },
      });

      this.logger.log(`Payment confirmed for order ${transaction.orderId}`);
    }
  }

  async getPaymentStatus(transactionId: string): Promise<{
    status: PaymentTxStatus;
    gatewayStatus?: string;
    confirmedAt?: Date | null;
  }> {
    const transaction = await this.prisma.paymentTransaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return {
      status: transaction.status,
      gatewayStatus: (transaction.metadata as any)?.mercadoPagoPayment?.status,
      confirmedAt: transaction.confirmedAt,
    };
  }

  async cancelPayment(transactionId: string): Promise<void> {
    const transaction = await this.prisma.paymentTransaction.findUnique({
      where: { id: transactionId },
      include: { order: true },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.status !== PaymentTxStatus.pending) {
      throw new BadRequestException('Only pending payments can be cancelled');
    }

    const config = this.getMercadoPagoConfig();

    try {
      // Cancelar pagamento no Mercado Pago
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${transaction.gatewayTxId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'cancelled' }),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Failed to cancel payment: ${error}`);
        throw new Error('Failed to cancel payment');
      }

      // Atualizar status localmente
      await this.prisma.paymentTransaction.update({
        where: { id: transactionId },
        data: { status: PaymentTxStatus.failed },
      });

      await this.prisma.order.update({
        where: transaction.orderId ? { id: transaction.orderId } : { id: '' }, // Fallback vazio se null
        data: { status: OrderStatus.cancelled },
      });

      this.logger.log(`Payment cancelled: ${transactionId}`);
    } catch (error) {
      this.logger.error(`Error cancelling payment: ${(error as any).message}`);
      throw error;
    }
  }
}
