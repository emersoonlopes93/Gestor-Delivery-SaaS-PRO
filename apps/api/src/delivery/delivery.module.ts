import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { DeliveryRateController } from './delivery-rate.controller';
import { DeliveryRateService } from './delivery-rate.service';

@Module({
  imports: [DatabaseModule, AuthModule, RbacModule],
  controllers: [DriversController, DeliveryRateController],
  providers: [DriversService, DeliveryRateService],
  exports: [DeliveryRateService],
})
export class DeliveryModule {}
