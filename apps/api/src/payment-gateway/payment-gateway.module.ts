import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RbacModule } from '../rbac/rbac.module';
import { PaymentGatewayController } from './payment-gateway.controller';
import { PaymentGatewayService } from './payment-gateway.service';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';

@Module({
  imports: [ConfigModule, RbacModule],
  controllers: [PaymentGatewayController],
  providers: [PaymentGatewayService, PrismaService, TenantContextService],
  exports: [PaymentGatewayService],
})
export class PaymentGatewayModule {}
