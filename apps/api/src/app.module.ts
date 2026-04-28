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
import { PaymentGatewayModule } from './payment-gateway/payment-gateway.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { SplitPaymentModule } from './split-payment/split-payment.module';
import { KdsModule } from './kds/kds.module';
import { PosModule } from './pos/pos.module';
import { CrmModule } from './crm/crm.module';
import { PromotionsModule } from './promotions/promotions.module';
import { InventoryModule } from './inventory/inventory.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { GoalsModule } from './goals/goals.module';
import { validateEnv } from './config/env.validation';
import { UploadModule } from './upload/upload.module';
import { CustomerAuthModule } from './auth/customer-auth.module';
import { PurchasingModule } from './purchasing/purchasing.module';
import { FinanceModule } from './finance/finance.module';
import { PlanGatingGuard } from './common/guards/plan-gating.guard';
import { NotificationsModule } from './notifications/notifications.module';

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
    PaymentGatewayModule,
    SchedulingModule,
    SplitPaymentModule,
    KdsModule,

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

    // Cash Register & POS (Phase 7)
    CashModule,
    PosModule,

    // CRM & Promotions (Phase 8)
    CrmModule,
    PromotionsModule,

    // Inventory & Recipe (Phase 9)
    InventoryModule,

    // Analytics & Goals (Phase 10)
    AnalyticsModule,
    GoalsModule,

    // Upload (Images)
    UploadModule,

    // Management (Phase 3)
    PurchasingModule,
    FinanceModule,

    // Customer Auth (B2C)
    CustomerAuthModule,

    // Notifications (WhatsApp + Push)
    NotificationsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PlanGatingGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
  ],
})
export class AppModule {}
