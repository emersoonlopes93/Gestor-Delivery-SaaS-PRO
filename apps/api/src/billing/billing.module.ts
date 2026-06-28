import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';
import { RbacModule } from '../rbac/rbac.module';
import { AsaasService } from './asaas.service';

import { BillingDomainModule } from './billing-domain.module';
import { AsaasSaasBillingWebhookController } from './asaas-saas-billing-webhook.controller';
import { PublicSaasController } from './public-saas.controller';
import { WebhookSecurityService } from './webhook-security.service';
import { WebhookSecuritySmokeController } from './webhook-security-smoke.controller';

@Module({
  imports: [RbacModule, BillingDomainModule],
  controllers: [BillingController, AsaasSaasBillingWebhookController, PublicSaasController, WebhookSecuritySmokeController],
  providers: [BillingService, AsaasService, PrismaService, TenantContextService, WebhookSecurityService],
  exports: [BillingService, BillingDomainModule],
})
export class BillingModule {}
