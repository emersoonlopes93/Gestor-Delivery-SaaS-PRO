import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';
import { PaymentTxStatus, PaymentMethod, OrderStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { WebhookDto } from './dto/create-pix-payment.dto';
import { createHmac, timingSafeEqual } from 'crypto';

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

interface MercadoPagoPreferenceRequest {
  items: Array<{
    title: string;
    quantity: number;
    unit_price: number;
    currency_id: string;
  }>;
  payer: {
    email: string;
    name?: string;
  };
  back_urls: {
    success: string;
    pending: string;
    failure: string;
  };
  auto_return: 'approved' | 'all';
  external_reference: string;
  notification_url?: string;
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

interface WebhookHeadersInput {
  signature?: string;
  webhookSecret?: string;
}


@Injectable()
export class PaymentGatewayService {
  private readonly logger = new Logger(PaymentGatewayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly configService: ConfigService,
  ) {}

  private async getMercadoPagoConfig(tenantId: string): Promise<MercadoPagoConfig> {
    const settings = (await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
    })) as any;

    const accessToken = settings?.mercadoPagoAccessToken || this.configService.get<string>('MERCADO_PAGO_ACCESS_TOKEN');
    const publicKey = settings?.mercadoPagoPublicKey || this.configService.get<string>('MERCADO_PAGO_PUBLIC_KEY');
    const webhookUrl = this.configService.get<string>('MERCADO_PAGO_WEBHOOK_URL');

    if (!accessToken || !publicKey || !webhookUrl) {
      throw new Error('Mercado Pago configuration missing for tenant ' + tenantId);
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
    const config = await this.getMercadoPagoConfig(tenantId);
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

  async createCardPayment(
    orderId: string, 
    token: string, 
    paymentMethodId: string, 
    issuerId: string, 
    installments: number,
    customerEmail: string,
    customerName?: string
  ): Promise<any> {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new Error('Tenant context not found');

    const order = await this.prisma.tenantClient.order.findUnique({
      where: { id: orderId },
    });

    if (!order) throw new NotFoundException('Order not found');

    const paymentTransaction = await this.prisma.tenantClient.paymentTransaction.create({
      data: {
        tenantId,
        orderId,
        gatewayName: 'mercadopago',
        gatewayTxId: '',
        method: PaymentMethod.credit_card,
        amount: order.total,
        status: PaymentTxStatus.pending,
        metadata: { customerEmail, customerName, orderNumber: order.orderNumber } as any,
      },
    });

    const config = await this.getMercadoPagoConfig(tenantId);
    const payload = {
      transaction_amount: Number(order.total),
      token,
      description: `Pedido #${order.orderNumber}`,
      installments: Number(installments),
      payment_method_id: paymentMethodId,
      issuer_id: issuerId,
      payer: {
        email: customerEmail,
        first_name: customerName?.split(' ')[0],
        last_name: customerName?.split(' ').slice(1).join(' '),
      },
      external_reference: paymentTransaction.id,
    };

    try {
      const response = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const mpResponse = await response.json();

      if (!response.ok) {
        this.logger.error(`Mercado Pago API error: ${JSON.stringify(mpResponse)}`);
        throw new Error(mpResponse.message || 'Failed to process card payment');
      }

      await this.prisma.tenantClient.paymentTransaction.update({
        where: { id: paymentTransaction.id },
        data: {
          gatewayTxId: mpResponse.id.toString(),
          status: mpResponse.status === 'approved' ? PaymentTxStatus.confirmed : PaymentTxStatus.pending,
          metadata: {
            ...paymentTransaction.metadata as any,
            mercadoPagoResponse: mpResponse,
          },
        },
      });

      // Se aprovado, atualizar pedido
      if (mpResponse.status === 'approved') {
        await this.prisma.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.confirmed },
        });
      }

      return mpResponse;
    } catch (error: any) {
      this.logger.error(`Error processing card payment: ${error.message}`);
      await this.prisma.tenantClient.paymentTransaction.update({
        where: { id: paymentTransaction.id },
        data: {
          status: PaymentTxStatus.failed,
          metadata: { ...paymentTransaction.metadata as any, error: error.message },
        },
      });
      throw error;
    }
  }

  async createPreferencePayment(
    orderId: string, 
    customerEmail: string, 
    customerName: string, 
    returnUrl: string,
    paymentMethod: PaymentMethod
  ): Promise<{ preferenceId: string; initPoint: string }> {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new Error('Tenant context not found');
    }

    const order = await this.prisma.tenantClient.order.findUnique({
      where: { id: orderId },
      include: { customer: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.status !== OrderStatus.pending) {
      throw new BadRequestException('Order is not in pending status');
    }

    const paymentTransaction = await this.prisma.tenantClient.paymentTransaction.create({
      data: {
        tenantId,
        orderId,
        gatewayName: 'mercadopago',
        gatewayTxId: '',
        method: paymentMethod,
        amount: order.total,
        status: PaymentTxStatus.pending,
        metadata: {
          customerEmail,
          customerName,
          orderNumber: order.orderNumber,
        } as any,
      },
    });

    const config = await this.getMercadoPagoConfig(tenantId);
    
    // Configura os URLs integrando com o ID do pedido para a view de /order/:id do storefront
    const checkoutSuccessUrl = `${returnUrl}/order/${order.publicTrackingToken}?payment=success`;
    const checkoutFailureUrl = `${returnUrl}/order/${order.publicTrackingToken}?payment=failure`;
    const checkoutPendingUrl = `${returnUrl}/order/${order.publicTrackingToken}?payment=pending`;

    const payload: MercadoPagoPreferenceRequest = {
      items: [
        {
          title: `Pedido #${order.orderNumber} - Gestor Delivery`,
          quantity: 1,
          unit_price: Number(order.total),
          currency_id: 'BRL',
        }
      ],
      payer: {
        email: customerEmail,
        name: customerName,
      },
      back_urls: {
        success: checkoutSuccessUrl,
        failure: checkoutFailureUrl,
        pending: checkoutPendingUrl,
      },
      auto_return: 'approved',
      external_reference: paymentTransaction.id,
      notification_url: config.webhookUrl,
    };

    try {
      const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Mercado Pago Preference API error: ${error}`);
        throw new Error('Failed to create Preference Checkout');
      }

      const mpResponse = await response.json();

      await this.prisma.tenantClient.paymentTransaction.update({
        where: { id: paymentTransaction.id },
        data: {
          gatewayTxId: mpResponse.id, // Para preference, salvamos o id da preference por enquanto
          metadata: {
            ...paymentTransaction.metadata as any,
            preferenceId: mpResponse.id,
            initPoint: mpResponse.init_point,
          },
        },
      });

      return {
        preferenceId: mpResponse.id,
        initPoint: mpResponse.init_point,
      };
    } catch (error) {
      this.logger.error(`Error creating Preference checkout: ${(error as any).message}`);
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

  async processWebhook(
    payload: WebhookDto,
    headers?: WebhookHeadersInput,
  ): Promise<void> {
    if (payload.type !== 'payment') {
      this.logger.log(`Ignoring webhook type: ${payload.type}`);
      return;
    }

    const transaction = await this.prisma.paymentTransaction.findFirst({
      where: { gatewayTxId: payload.data.id.toString() },
    });

    if (!transaction) {
      this.logger.warn(`Transaction not found for payment ${payload.data.id}`);
      return;
    }

    const signatureValid = await this.validateWebhookSignature(
      payload,
      transaction.tenantId,
      headers,
    );
    if (!signatureValid) {
      this.logger.warn(
        `Invalid webhook signature for tenant ${transaction.tenantId} payment ${payload.data.id}`,
      );
      throw new BadRequestException('Invalid webhook signature');
    }

    const config = await this.getMercadoPagoConfig(transaction.tenantId);

    if (transaction.tenantId) {
      this.logger.log(`Processing secured payment update for tenant ${transaction.tenantId}`);
    }

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

  private async validateWebhookSignature(
    payload: WebhookDto,
    tenantId: string,
    headers?: WebhookHeadersInput,
  ): Promise<boolean> {
    const configuredSecret = await this.getWebhookSecret(tenantId);
    if (!configuredSecret) {
      this.logger.warn(`Webhook secret is not configured for tenant ${tenantId}`);
      return false;
    }

    if (headers?.webhookSecret && headers.webhookSecret === configuredSecret) {
      return true;
    }

    const signature = headers?.signature?.trim();
    if (!signature) {
      return false;
    }

    if (signature === configuredSecret) {
      return true;
    }

    const expectedHex = createHmac('sha256', configuredSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    const v1Match = signature.match(/(?:^|,)v1=([a-fA-F0-9]+)/);
    const providedHex = (v1Match?.[1] ?? signature).trim().toLowerCase();

    if (!/^[a-f0-9]+$/.test(providedHex)) {
      return false;
    }

    const providedBuffer = Buffer.from(providedHex, 'hex');
    const expectedBuffer = Buffer.from(expectedHex, 'hex');

    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(providedBuffer, expectedBuffer);
  }

  private async getWebhookSecret(tenantId: string): Promise<string | undefined> {
    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { mercadoPagoWebhookSecret: true },
    });

    const tenantSecret = settings?.mercadoPagoWebhookSecret?.trim();
    if (tenantSecret) return tenantSecret;

    const globalSecret = this.configService.get<string>('MERCADO_PAGO_WEBHOOK_SECRET')?.trim();
    return globalSecret || undefined;
  }

  private async processPaymentUpdate(payment: any): Promise<void> {
    // Buscar transação pelo external_reference (que usamos para o Transaction ID do sistema)
    const transaction = await this.prisma.paymentTransaction.findFirst({
      where: { id: payment.external_reference },
      include: { order: true },
    });

    if (!transaction) {
      // Fallback para quem salvou gatewayTxId = payment.id no Pix
      const fallbackTx = await this.prisma.paymentTransaction.findFirst({
        where: { gatewayTxId: payment.id.toString() },
        include: { order: true },
      });
      
      if (!fallbackTx) {
        this.logger.warn(`Transaction not found for payment ${payment.id}`);
        return;
      }
      Object.assign(transaction || {}, fallbackTx); // Trick typescript se precisasse
      return this.updateTransactionRecord(fallbackTx, payment);
    }
    
    return this.updateTransactionRecord(transaction, payment);
  }

  private async updateTransactionRecord(transaction: any, payment: any): Promise<void> {

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

    const config = await this.getMercadoPagoConfig(transaction.tenantId);

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
