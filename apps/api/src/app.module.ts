import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerGuard } from '@nestjs/throttler';
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
import { BillingModule } from './billing/billing.module';
import { PosModule } from './pos/pos.module';
import { CrmModule } from './crm/crm.module';
import { PromotionsModule } from './promotions/promotions.module';
import { InventoryModule } from './inventory/inventory.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { GoalsModule } from './goals/goals.module';
import { validateEnv } from './config/env.validation';
import { UploadModule } from './upload/upload.module';
import { CustomerAuthModule } from './auth/customer-auth.module';

@Module({
  imports: [
    // Configuration — loads .env
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),

    // Rate limiting (global)
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: Number(process.env.RATE_LIMIT_TTL_SECONDS ?? 60),
        limit: Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 120),
      },
      {
        name: 'auth',
        ttl: Number(process.env.RATE_LIMIT_AUTH_TTL_SECONDS ?? 60),
        limit: Number(process.env.RATE_LIMIT_AUTH_MAX_REQUESTS ?? 10),
      },
      {
        name: 'public',
        ttl: Number(process.env.RATE_LIMIT_PUBLIC_TTL_SECONDS ?? 60),
        limit: Number(process.env.RATE_LIMIT_PUBLIC_MAX_REQUESTS ?? 60),
      },
    ]),

    // Database (Prisma)
    DatabaseModule,

    // Health check
    HealthModule,

    // Auth (tenant auth)
    AuthModule,

    // Multi-tenant
    TenantModule,

    // Auth & RBAC (Phase 2)
    RbacModule,
    AdminModule,
    BillingModule,

    // Tenant Context (Shared)
    TenantContextModule,

    // Catalog Module (Phase 2)
    CatalogModule,

    // Public Storefront (Phase 3)
    StorefrontModule,

    // Logistics & Delivery (Phase 6)
    DeliveryModule,

    // Cash Register (Phase 7)
    CashModule,

    // CRM (Phase 8)
    CrmModule,

    // Promotions & Cashback (Phase 8)
    PromotionsModule,

    // Inventory & Recipe (Phase 9)
    InventoryModule,

    // Analytics & Reports (Phase 10)
    AnalyticsModule,

    // Goals & Performance (Phase 10)
    GoalsModule,

    // Upload (Images)
    UploadModule,

    // Orders & Checkout (Phase 4)
    OrdersModule,

    // Point of Sale (Phase 7)
    PosModule,

    // Customer Auth (B2C)
    CustomerAuthModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
  ],
})
export class AppModule {}
