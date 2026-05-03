import { 
  Controller, 
  Post, 
  Get, 
  Body, 
  Param, 
  Headers, 
  BadRequestException,
  HttpStatus, 
  HttpCode,
  UseGuards 
} from '@nestjs/common';
import { RequirePermissions } from '../common/decorators';
import { TenantAuthGuard } from '../auth/guards/tenant-auth.guard';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { PaymentGatewayService } from './payment-gateway.service';
import { 
  CreatePixPaymentDto, 
  CreatePreferenceDto, 
  CreateCardPaymentDto,
  WebhookDto 
} from './dto/create-pix-payment.dto';
import { PaymentMethod } from '@prisma/client';

@Controller('payment-gateway')
export class PaymentGatewayController {
  constructor(private readonly paymentGatewayService: PaymentGatewayService) {}

  @Post('pix/create')
  @UseGuards(TenantAuthGuard, PermissionsGuard)
  @RequirePermissions('orders.create')
  async createPixPayment(@Body() dto: CreatePixPaymentDto) {
    return this.paymentGatewayService.createPixPayment(
      dto.orderId,
      dto.customerEmail,
      dto.customerName
    );
  }

  @Post('card/create')
  @UseGuards(TenantAuthGuard, PermissionsGuard)
  @RequirePermissions('orders.create')
  async createCardPayment(@Body() dto: CreateCardPaymentDto) {
    return this.paymentGatewayService.createCardPayment(
      dto.orderId,
      dto.token,
      dto.paymentMethodId,
      dto.issuerId,
      dto.installments,
      dto.customerEmail,
      dto.customerName
    );
  }

  @Post('preference/create')
  @UseGuards(TenantAuthGuard, PermissionsGuard)
  @RequirePermissions('orders.create')
  async createPreferencePayment(@Body() dto: CreatePreferenceDto) {
    return this.paymentGatewayService.createPreferencePayment(
      dto.orderId,
      dto.customerEmail,
      dto.customerName,
      dto.returnUrl,
      dto.paymentMethod as PaymentMethod
    );
  }

  @Get('pix/status/:transactionId')
  @UseGuards(TenantAuthGuard, PermissionsGuard)
  @RequirePermissions('orders.read')
  async getPaymentStatus(@Param('transactionId') transactionId: string) {
    return this.paymentGatewayService.getPaymentStatus(transactionId);
  }

  @Post('pix/cancel/:transactionId')
  @UseGuards(TenantAuthGuard, PermissionsGuard)
  @RequirePermissions('orders.update')
  @HttpCode(HttpStatus.OK)
  async cancelPayment(@Param('transactionId') transactionId: string) {
    await this.paymentGatewayService.cancelPayment(transactionId);
    return { message: 'Payment cancelled successfully' };
  }

  @Post('webhook/mercadopago')
  @HttpCode(HttpStatus.OK)
  async handleMercadoPagoWebhook(
    @Body() payload: WebhookDto,
    @Headers('x-signature') signature: string | undefined,
    @Headers('x-webhook-secret') webhookSecret: string | undefined,
  ) {
    await this.paymentGatewayService.processWebhook(payload, {
      signature,
      webhookSecret,
    });
    
    return { status: 'ok' };
  }

  // Endpoint público para consulta de QR code (sem autenticação)
  @Get('public/pix/:transactionId')
  async getPixQrCode(@Param('transactionId') transactionId: string) {
    try {
      const status = await this.paymentGatewayService.getPaymentStatus(transactionId);
      return status;
    } catch {
      // Não expor detalhes do erro em endpoint público
      throw new BadRequestException('Invalid transaction');
    }
  }
}
