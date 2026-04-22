import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { OrdersController } from './orders.controller';
import { PublicOrdersController } from './public-orders.controller';
import { OrdersService } from './orders.service';
import { CheckoutValidatorService } from './checkout-validator.service';
import { AvailabilityService } from './availability.service';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { CrmModule } from '../crm/crm.module';
import { InventoryModule } from '../inventory/inventory.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { CatalogModule } from '../catalog/catalog.module';
import { PaymentGatewayModule } from '../payment-gateway/payment-gateway.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    RbacModule,
    PromotionsModule,
    CrmModule,
    InventoryModule,
    DeliveryModule,
    CatalogModule,
    PaymentGatewayModule,
  ],
  controllers: [OrdersController, PublicOrdersController],
  providers: [OrdersService, CheckoutValidatorService, AvailabilityService],
  exports: [OrdersService, CheckoutValidatorService],
})
export class OrdersModule {}
