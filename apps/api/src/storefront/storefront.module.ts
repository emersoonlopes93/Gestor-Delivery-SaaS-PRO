import { Module, forwardRef } from '@nestjs/common';
import { StorefrontController } from './storefront.controller';
import { StorefrontService } from './storefront.service';
import { DatabaseModule } from '../database/database.module';


import { CatalogModule } from '../catalog/catalog.module';

import { SchedulingModule } from '../scheduling/scheduling.module';
import { UploadModule } from '../upload/upload.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { StorefrontCacheService } from './services/storefront-cache.service';
import { FeatureControlModule } from '../feature-control/feature-control.module';

@Module({
  imports: [DatabaseModule, CatalogModule, SchedulingModule, forwardRef(() => UploadModule), AnalyticsModule, FeatureControlModule],
  controllers: [StorefrontController],
  providers: [StorefrontService, StorefrontCacheService],
  exports: [StorefrontService, StorefrontCacheService],
})
export class StorefrontModule {}
