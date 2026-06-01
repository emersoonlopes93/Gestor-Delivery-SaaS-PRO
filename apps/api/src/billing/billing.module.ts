import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';
import { RbacModule } from '../rbac/rbac.module';
import { AsaasService } from './asaas.service';
import { BillingWebhookController } from './billing-webhook.controller';
import { BillingDomainModule } from './billing-domain.module';
import { AsaasSaasBillingWebhookController } from './asaas-saas-billing-webhook.controller';

@Module({
  imports: [RbacModule, BillingDomainModule],
  controllers: [BillingController, BillingWebhookController, AsaasSaasBillingWebhookController],
  providers: [BillingService, AsaasService, PrismaService, TenantContextService],
  exports: [BillingService, BillingDomainModule],
})
export class BillingModule {}
