import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { WhatsAppChannelModule } from '../whatsapp-channel/whatsapp-channel.module';
import { CampaignsService } from './services/campaigns.service';
import { CampaignDispatcherService } from './services/campaign-dispatcher.service';
import { CampaignProcessor } from './services/campaign.processor';
import { RecoveryCampaignService } from './services/recovery-campaign.service';
import { UpsellRecommendationEngine } from './services/upsell-recommendation.engine';
import { AbandonedCartService } from './services/abandoned-cart.service';
import { CampaignAutomationService } from './services/campaign-automation.service';
import { CampaignsController } from './controllers/campaigns.controller';
import { BullModule } from '@nestjs/bullmq';
import { RbacModule } from '../rbac/rbac.module';
import { CrmModule } from '../crm/crm.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { BillingDomainModule } from '../billing/billing-domain.module';
import { isCampaignDispatchEnabled } from './campaign-dispatch.config';

const enableCampaignDispatch = isCampaignDispatchEnabled();

// Log campaign dispatcher status at startup
if (!enableCampaignDispatch && process.env.CAMPAIGNS_DISPATCH_ENABLED === 'true') {
  console.log('[QUEUE] campaign_dispatch_disabled - redis_disabled_for_dev');
} else if (enableCampaignDispatch) {
  console.log('[QUEUE] campaign_dispatch_enabled');
}

@Module({
  imports: [
    DatabaseModule,
    WhatsAppChannelModule, // para enviar as mensagens das campanhas
    RbacModule, // para PermissionsGuard e RbacService
    forwardRef(() => CrmModule),
    forwardRef(() => AnalyticsModule),
    PromotionsModule,
    BillingDomainModule,
    ...(enableCampaignDispatch
      ? [
          BullModule.registerQueue({
            name: 'campaign-dispatch',
            defaultJobOptions: {
              removeOnComplete: 100,
              removeOnFail: 1000,
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 10000, // 10s
              },
            },
          }),
        ]
      : []),
  ],
  controllers: [CampaignsController],
  providers: [
    CampaignsService,
    RecoveryCampaignService,
    UpsellRecommendationEngine,
    AbandonedCartService,
    CampaignAutomationService,
    ...(enableCampaignDispatch ? [CampaignDispatcherService, CampaignProcessor] : []),
  ],
  exports: [
    CampaignsService,
    RecoveryCampaignService,
    UpsellRecommendationEngine,
    AbandonedCartService,
    CampaignAutomationService,
    ...(enableCampaignDispatch ? [CampaignDispatcherService] : []),
  ],
})
export class CampaignsModule {}
