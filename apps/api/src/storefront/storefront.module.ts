import { Module, forwardRef } from '@nestjs/common';
import { StorefrontController } from './storefront.controller';
import { StorefrontService } from './storefront.service';
import { DatabaseModule } from '../database/database.module';


import { CatalogModule } from '../catalog/catalog.module';

import { SchedulingModule } from '../scheduling/scheduling.module';
import { UploadModule } from '../upload/upload.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [DatabaseModule, CatalogModule, SchedulingModule, forwardRef(() => UploadModule), AnalyticsModule],
  controllers: [StorefrontController],
  providers: [StorefrontService],
  exports: [StorefrontService],
})
export class StorefrontModule {}
