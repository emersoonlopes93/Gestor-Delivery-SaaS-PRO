import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';
import { RbacModule } from '../rbac/rbac.module';
import { AsaasService } from './asaas.service';
import { BillingWebhookController } from './billing-webhook.controller';

@Module({
  imports: [RbacModule],
  controllers: [BillingController, BillingWebhookController],
  providers: [BillingService, AsaasService, PrismaService, TenantContextService],
  exports: [BillingService],
})
export class BillingModule {}
