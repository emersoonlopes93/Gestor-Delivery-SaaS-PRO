import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RbacModule } from '../rbac/rbac.module';
import { PaymentGatewayController } from './payment-gateway.controller';
import { PaymentGatewayService } from './payment-gateway.service';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';
import { PaymentFoundationModule } from '../payment-foundation/payment-foundation.module';

@Module({
  imports: [ConfigModule, RbacModule, PaymentFoundationModule],
  controllers: [PaymentGatewayController],
  providers: [PaymentGatewayService, PrismaService, TenantContextService],
  exports: [PaymentGatewayService],
})
export class PaymentGatewayModule {}
