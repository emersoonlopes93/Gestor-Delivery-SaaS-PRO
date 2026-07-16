import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OrdersModule } from '../orders/orders.module';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { CrmModule } from '../crm/crm.module';
import { FeatureControlModule } from '../feature-control/feature-control.module';
import { MARKETPLACE_EVENT_QUEUE } from './marketplace.constants';
import { MarketplaceWebhookController } from './controllers/marketplace-webhook.controller';
import { MarketplaceTenantController } from './controllers/marketplace-tenant.controller';
import { IfoodProvider } from './providers/ifood.provider';
import { MarketplaceProviderRegistryService } from './services/marketplace-provider-registry.service';
import { MarketplaceConnectionService } from './services/marketplace-connection.service';
import { MarketplaceEventInboxService } from './services/marketplace-event-inbox.service';
import { MarketplaceOrderIngestionService } from './services/marketplace-order-ingestion.service';
import { MarketplaceStatusSyncService } from './services/marketplace-status-sync.service';
import { MarketplaceEventProcessor } from './processors/marketplace-event.processor';
import { MarketplaceCredentialService } from './services/marketplace-credential.service';
import { IfoodTokenService } from './services/ifood-token.service';
import { IfoodHttpClientService } from './services/ifood-http-client.service';
import { MarketplaceDivergenceService } from './services/marketplace-divergence.service';
import { MarketplaceReconciliationService } from './services/marketplace-reconciliation.service';
import { MarketplaceAdminOperationsService } from './services/marketplace-admin-operations.service';

const enableMarketplaceQueue =
  process.env.REDIS_ENABLED !== 'false' &&
  process.env.BULLMQ_ENABLED === 'true';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    RbacModule,
    CrmModule,
    FeatureControlModule,
    forwardRef(() => OrdersModule),
    ...(enableMarketplaceQueue
      ? [
          BullModule.registerQueue({
            name: MARKETPLACE_EVENT_QUEUE,
            defaultJobOptions: {
              removeOnComplete: 100,
              removeOnFail: 1000,
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 5000,
              },
            },
          }),
        ]
      : []),
  ],
  controllers: [MarketplaceWebhookController, MarketplaceTenantController],
  providers: [
    IfoodProvider,
    MarketplaceCredentialService,
    IfoodTokenService,
    IfoodHttpClientService,
    MarketplaceProviderRegistryService,
    MarketplaceConnectionService,
    MarketplaceEventInboxService,
    MarketplaceOrderIngestionService,
    MarketplaceStatusSyncService,
    MarketplaceDivergenceService,
    MarketplaceReconciliationService,
    MarketplaceAdminOperationsService,
    ...(enableMarketplaceQueue ? [MarketplaceEventProcessor] : []),
  ],
  exports: [
    MarketplaceConnectionService,
    MarketplaceEventInboxService,
    MarketplaceOrderIngestionService,
    MarketplaceStatusSyncService,
    MarketplaceCredentialService,
    MarketplaceReconciliationService,
    MarketplaceAdminOperationsService,
  ],
})
export class MarketplaceModule {}
