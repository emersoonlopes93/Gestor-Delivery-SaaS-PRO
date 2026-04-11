import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { TenantModule } from './tenant/tenant.module';
import { RbacModule } from './rbac/rbac.module';
import { AdminModule } from './admin/admin.module';
import { TenantContextModule } from './common/context/tenant-context.module';
import { TenantInterceptor } from './common/interceptors/tenant.interceptor';
import { CatalogModule } from './catalog/catalog.module';
import { StorefrontModule } from './storefront/storefront.module';
import { OrdersModule } from './orders/orders.module';
import { DeliveryModule } from './delivery/delivery.module';
import { CashModule } from './cash/cash.module';
import { PosModule } from './pos/pos.module';
import { CrmModule } from './crm/crm.module';
import { PromotionsModule } from './promotions/promotions.module';
import { InventoryModule } from './inventory/inventory.module';

@Module({
  imports: [
    // Configuration — loads .env
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),

    // Database (Prisma)
    DatabaseModule,

    // Health check
    HealthModule,

    // Auth (tenant auth)
    AuthModule,

    // Multi-tenant
    TenantModule,

    // RBAC (tenant)
    RbacModule,

    // SaaS Admin context
    AdminModule,

    // Tenant Context (Shared)
    TenantContextModule,

    // Catalog Module (Phase 2)
    CatalogModule,

    // Public Storefront (Phase 3)
    StorefrontModule,

    // Orders & Checkout (Phase 4)
    OrdersModule,

    // Logistics & Delivery (Phase 6)
    DeliveryModule,

    // Cash Register (Phase 7)
    CashModule,

    // Point of Sale (Phase 7)
    PosModule,

    // CRM (Phase 8)
    CrmModule,

    // Promotions & Cashback (Phase 8)
    PromotionsModule,

    // Inventory & Recipe (Phase 9)
    InventoryModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
  ],
})
export class AppModule {}

