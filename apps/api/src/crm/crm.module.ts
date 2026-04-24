import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { CustomerController } from './customer.controller';
import { CustomerService } from './customer.service';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { CrmSegmentationService } from './crm-segmentation.service';

@Module({
  imports: [DatabaseModule, AuthModule, RbacModule],
  controllers: [CustomerController],
  providers: [CustomerService, CrmSegmentationService],
  exports: [CustomerService, CrmSegmentationService],
})
export class CrmModule {}
