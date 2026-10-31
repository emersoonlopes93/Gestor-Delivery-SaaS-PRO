import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RbacModule } from '../rbac/rbac.module';
import { PaymentGatewayController } from './payment-gateway.controller';
import { PaymentGatewayService } from './payment-gateway.service';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';
import { PaymentFoundationModule } from '../payment-foundation/payment-foundation.module';
import { OnlinePaymentActivationController } from '../payment-foundation/online-payment-activation.controller';
import { MercadoPagoRefundClient } from './mercadopago-refund.client';
import { PaymentRefundService } from './payment-refund.service';

@Module({
  imports: [ConfigModule, RbacModule, PaymentFoundationModule],
  controllers: [PaymentGatewayController, OnlinePaymentActivationController],
  providers: [
    PaymentGatewayService,
    PaymentRefundService,
    MercadoPagoRefundClient,
    PrismaService,
    TenantContextService,
  ],
  exports: [PaymentGatewayService, PaymentRefundService],
})
export class PaymentGatewayModule {}
