import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { OrdersController } from './orders.controller';
import { PublicOrdersController } from './public-orders.controller';
import { OrdersService } from './orders.service';
import { OrdersGateway } from './orders.gateway';
import { CheckoutValidatorService } from './checkout-validator.service';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { CrmModule } from '../crm/crm.module';
import { InventoryModule } from '../inventory/inventory.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { CatalogModule } from '../catalog/catalog.module';
import { PaymentGatewayModule } from '../payment-gateway/payment-gateway.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { KdsModule } from '../kds/kds.module';
import { BillingDomainModule } from '../billing/billing-domain.module';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { FeatureControlModule } from '../feature-control/feature-control.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PrintingModule } from '../printing/printing.module';
import { PublicOrderTrackingAccessService } from './public-order-tracking-access.service';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    RbacModule,
    PromotionsModule,
    CrmModule,
    InventoryModule,
    forwardRef(() => DeliveryModule),
    CatalogModule,
    PaymentGatewayModule,
    SchedulingModule,
    forwardRef(() => NotificationsModule),
    KdsModule,
    BillingDomainModule,
    forwardRef(() => MarketplaceModule),
    FeatureControlModule,
    AnalyticsModule,
    PrintingModule,
  ],
  controllers: [OrdersController, PublicOrdersController],
  providers: [OrdersService, CheckoutValidatorService, OrdersGateway, PublicOrderTrackingAccessService],
  exports: [OrdersService, CheckoutValidatorService, OrdersGateway, PublicOrderTrackingAccessService],
})
export class OrdersModule {}
