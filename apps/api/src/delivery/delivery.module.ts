import { Module, forwardRef } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { PrismaService } from '../database/prisma.service';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { DriversController } from './drivers.controller';
import { DriverOperationsController } from './driver.controller';
import { DriversService } from './drivers.service';
import { DeliveryCoverageController } from './delivery-coverage.controller';
import { DeliveryCoverageService } from './delivery-coverage.service';
import { DeliveryRateController } from './delivery-rate.controller';
import { DeliveryRateService, DELIVERY_COVERAGE_REPO, DELIVERY_RATE_RULE_REPO } from './delivery-rate.service';
import { DeliveryTrackingGateway } from './delivery-tracking.gateway';
import { GeocodingService } from './geocoding.service';
import { LocationModule } from '../location/location.module';

@Module({
  imports: [DatabaseModule, AuthModule, RbacModule, LocationModule, forwardRef(() => OrdersModule)],
  controllers: [DriversController, DriverOperationsController, DeliveryRateController, DeliveryCoverageController],
  providers: [
    DriversService,
    DeliveryTrackingGateway,
    DeliveryCoverageService,
    {
      provide: DELIVERY_RATE_RULE_REPO,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => prisma.deliveryRateRule,
    },
    {
      provide: DELIVERY_COVERAGE_REPO,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => prisma.deliveryCoverageConfig,
    },
    GeocodingService,
    DeliveryRateService,
  ],
  exports: [DeliveryRateService, DriversService, GeocodingService, DeliveryTrackingGateway],
})
export class DeliveryModule {}
