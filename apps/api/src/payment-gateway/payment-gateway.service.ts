import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';
import { PaymentTxStatus, PaymentMethod, OrderStatus, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { WebhookDto } from './dto/create-pix-payment.dto';
import { createHmac, timingSafeEqual } from 'crypto';
import { MercadoPagoPaymentSchema, MercadoPagoPayment } from './schemas/mercadopago.schema';
import { ModuleRef } from '@nestjs/core';
import { OrdersService } from '../orders/orders.service';
import { OrderStatus as SharedOrderStatus } from '@gestor/types';

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

interface PaymentMetadata {
  customerEmail: string;
  customerName?: string;
  orderNumber: string;
  preferenceId?: string;
  initPoint?: string;
  mercadoPagoResponse?: MercadoPagoPixResponse | MercadoPagoPayment;
  mercadoPagoPayment?: MercadoPagoPayment;
  error?: string;
}

@Injectable()
export class PaymentGatewayService {
  private readonly logger = new Logger(PaymentGatewayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly configService: ConfigService,
    private readonly moduleRef: ModuleRef,
  ) {}

  private async getOrdersService(): Promise<OrdersService> {
    const service = this.moduleRef.get(OrdersService, { strict: false });
    if (!service) {
      const message = 'OrdersService is not available in the module context. This may indicate a circular dependency or module initialization issue.';
      this.logger.error(message);
      throw new Error(message);
    }
    return service;
  }

  private mergeMetadata(current: Prisma.JsonValue, update: Partial<PaymentMetadata>): Prisma.InputJsonValue {
    const base = (current && typeof current === 'object' && !Array.isArray(current)) 
      ? (current as Record<string, Prisma.JsonValue>) 
      : {};
    
    return {
      ...base,
      ...update,
    } as Prisma.InputJsonObject;
  }

  private async getMercadoPagoConfig(tenantId: string): Promise<MercadoPagoConfig> {
    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
    });

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

    const paymentTransaction = await this.prisma.tenantClient.paymentTransaction.create({
      data: {
        tenantId,
        orderId,
        gatewayName: 'mercadopago',
        gatewayTxId: '',
        method: PaymentMethod.pix,
        amount: order.total,
        status: PaymentTxStatus.pending,
        metadata: {
          customerEmail,
          customerName,
          orderNumber: order.orderNumber,
        } as Prisma.InputJsonObject,
      },
    });

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

      await this.prisma.tenantClient.paymentTransaction.update({
        where: { id: paymentTransaction.id },
        data: {
          gatewayTxId: mpResponse.id,
          metadata: this.mergeMetadata(paymentTransaction.metadata, {
            mercadoPagoResponse: mpResponse,
          }),
        },
      });

      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 30);

      return {
        transactionId: paymentTransaction.id,
        qrCode: mpResponse.point_of_interaction.transaction_data.qr_code,
        qrCodeBase64: mpResponse.point_of_interaction.transaction_data.qr_code_base64,
        ticketUrl: mpResponse.point_of_interaction.transaction_data.ticket_url,
        expiresAt,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error creating PIX payment: ${message}`);
      
      await this.prisma.tenantClient.paymentTransaction.update({
        where: { id: paymentTransaction.id },
        data: {
          status: PaymentTxStatus.failed,
          metadata: this.mergeMetadata(paymentTransaction.metadata, {
            error: message,
          }),
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
  ): Promise<MercadoPagoPayment> {
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
        metadata: { customerEmail, customerName, orderNumber: order.orderNumber } as Prisma.InputJsonObject,
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

      const mpRawResponse = await response.json();
      const mpResponse = MercadoPagoPaymentSchema.parse(mpRawResponse);

      if (!response.ok) {
        this.logger.error(`Mercado Pago API error: ${JSON.stringify(mpRawResponse)}`);
        throw new Error((mpRawResponse as { message?: string }).message || 'Failed to process card payment');
      }

      await this.prisma.tenantClient.paymentTransaction.update({
        where: { id: paymentTransaction.id },
        data: {
          gatewayTxId: mpResponse.id.toString(),
          status: mpResponse.status === 'approved' ? PaymentTxStatus.confirmed : PaymentTxStatus.pending,
          metadata: this.mergeMetadata(paymentTransaction.metadata, {
            mercadoPagoResponse: mpResponse,
          }),
        },
      });

      if (mpResponse.status === 'approved') {
        try {
          const ordersService = await this.getOrdersService();
          await ordersService.updateOrderStatus(orderId, tenantId, {
            status: 'confirmed',
            note: 'Pagamento via cartão de crédito aprovado.',
          });
        } catch (err) {
          this.logger.error(`Error transitioning order ${orderId} to confirmed in createCardPayment: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      return mpResponse;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error processing card payment: ${message}`);
      await this.prisma.tenantClient.paymentTransaction.update({
        where: { id: paymentTransaction.id },
        data: {
          status: PaymentTxStatus.failed,
          metadata: this.mergeMetadata(paymentTransaction.metadata, { error: message }),
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
        } as Prisma.InputJsonObject,
      },
    });

    const config = await this.getMercadoPagoConfig(tenantId);
    
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

      const mpResponse = await response.json() as { id: string; init_point: string };

      await this.prisma.tenantClient.paymentTransaction.update({
        where: { id: paymentTransaction.id },
        data: {
          gatewayTxId: mpResponse.id,
          metadata: this.mergeMetadata(paymentTransaction.metadata, {
            preferenceId: mpResponse.id,
            initPoint: mpResponse.init_point,
          }),
        },
      });

      return {
        preferenceId: mpResponse.id,
        initPoint: mpResponse.init_point,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error creating Preference checkout: ${message}`);
      await this.prisma.tenantClient.paymentTransaction.update({
        where: { id: paymentTransaction.id },
        data: {
          status: PaymentTxStatus.failed,
          metadata: this.mergeMetadata(paymentTransaction.metadata, {
            error: message,
          }),
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

      const mpRawPayment = await response.json();
      const payment = MercadoPagoPaymentSchema.parse(mpRawPayment);
      await this.processPaymentUpdate(payment);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error processing webhook: ${message}`);
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

  private async processPaymentUpdate(payment: MercadoPagoPayment): Promise<void> {
    if (!payment.external_reference) {
      this.logger.warn(`No external_reference found for payment ${payment.id}`);
      return;
    }

    const transaction = await this.prisma.paymentTransaction.findFirst({
      where: { id: payment.external_reference },
      include: { order: true },
    });

    if (!transaction) {
      const fallbackTx = await this.prisma.paymentTransaction.findFirst({
        where: { gatewayTxId: payment.id.toString() },
        include: { order: true },
      });
      
      if (!fallbackTx) {
        this.logger.warn(`Transaction not found for payment ${payment.id}`);
        return;
      }
      return this.updateTransactionRecord(fallbackTx, payment);
    }
    
    return this.updateTransactionRecord(transaction, payment);
  }

  private async updateTransactionRecord(transaction: Prisma.PaymentTransactionGetPayload<{ include: { order: true } }>, payment: MercadoPagoPayment): Promise<void> {
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

    await this.prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: newStatus,
        metadata: this.mergeMetadata(transaction.metadata, {
          mercadoPagoPayment: payment,
        }),
      },
    });

    if (newStatus === PaymentTxStatus.confirmed && transaction.orderId) {
      try {
        const ordersService = await this.getOrdersService();
        await ordersService.updateOrderStatus(transaction.orderId, transaction.tenantId, {
          status: orderStatus as SharedOrderStatus,
          note: `Pagamento via gateway confirmado (Transação: ${transaction.gatewayTxId}).`,
        });
        this.logger.log(`Payment confirmed for order ${transaction.orderId}`);
      } catch (err) {
        this.logger.error(`Error transitioning order ${transaction.orderId} to ${orderStatus} in webhook update: ${err instanceof Error ? err.message : String(err)}`);
      }
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

    const metadata = (transaction.metadata && typeof transaction.metadata === 'object' && !Array.isArray(transaction.metadata))
      ? (transaction.metadata as Record<string, Prisma.JsonValue>)
      : {};

    const mpPayment = (metadata.mercadoPagoPayment || metadata.mercadoPagoResponse) as Record<string, Prisma.JsonValue> | undefined;

    return {
      status: transaction.status,
      gatewayStatus: mpPayment?.status as string | undefined,
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

      await this.prisma.paymentTransaction.update({
        where: { id: transactionId },
        data: { status: PaymentTxStatus.failed },
      });

      if (transaction.orderId) {
        try {
          const ordersService = await this.getOrdersService();
          await ordersService.updateOrderStatus(
            transaction.orderId,
            transaction.tenantId,
            {
              status: 'cancelled' as SharedOrderStatus,
              note: 'Pagamento cancelado pelo gateway.',
            },
            'SYSTEM'
          );
        } catch (error) {
          this.logger.error(`Failed to update order status to cancelled for order ${transaction.orderId}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      this.logger.log(`Payment cancelled: ${transactionId}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error cancelling payment: ${message}`);
      throw error;
    }
  }
}
