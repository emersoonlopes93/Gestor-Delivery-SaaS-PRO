import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerGuard } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';
import { EventEmitterModule } from '@nestjs/event-emitter';
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
import { WhatsAppChannelModule } from './whatsapp-channel/whatsapp-channel.module';
import { AiAgentModule } from './ai-agent/ai-agent.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { ChatModule } from './chat/chat.module';
import { getApiEnvFilePaths, loadApiEnvFiles } from './config/env-paths';
import { MailModule } from './mail/mail.module';
import { PrintingModule } from './printing/printing.module';
import { AppController } from './app.controller';
import { MarketplaceModule } from './marketplace/marketplace.module';

loadApiEnvFiles();

const REDIS_CONNECT_TIMEOUT_MS = Number(process.env.REDIS_CONNECT_TIMEOUT_MS ?? 3000);
const REDIS_RECONNECT_BASE_DELAY_MS = Number(process.env.REDIS_RECONNECT_BASE_DELAY_MS ?? 500);
const REDIS_RECONNECT_MAX_DELAY_MS = Number(process.env.REDIS_RECONNECT_MAX_DELAY_MS ?? 5000);
const REDIS_RECONNECT_MAX_ATTEMPTS = Number(process.env.REDIS_RECONNECT_MAX_ATTEMPTS ?? 3);
const REDIS_LOG_THROTTLE_MS = Number(process.env.REDIS_LOG_THROTTLE_MS ?? 60000);
const redisLogState = new Map<string, { lastAt: number; suppressed: number }>();

function classifyRedisError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/quota|rate.?limit|too many|limit exceeded|request limit/i.test(message)) return 'quota_or_rate_limit';
  if (/auth|password|credential|unauthorized|invalid username|invalid password|noperm/i.test(message)) return 'authentication';
  if (/timeout|etimedout|econnrefused|enotfound|econnreset|network|socket/i.test(message)) return 'network_or_timeout';
  if (/closed|unavailable|offline|disconnect/i.test(message)) return 'unavailable';
  return 'unknown';
}

function logRedisState(level: 'log' | 'warn' | 'error', key: string, message: string, error?: unknown) {
  const now = Date.now();
  const state = redisLogState.get(key);
  if (state && now - state.lastAt < REDIS_LOG_THROTTLE_MS) {
    state.suppressed += 1;
    return;
  }
  const suppressedSuffix = state?.suppressed ? ` suppressed=${state.suppressed}` : '';
  const errorSuffix = error ? ` reason=${classifyRedisError(error)} message=${error instanceof Error ? error.message : String(error)}` : '';
  console[level](`${message}${suppressedSuffix}${errorSuffix}`);
  redisLogState.set(key, { lastAt: now, suppressed: 0 });
}

function getRedisReconnectDelay(attempt: number): number | undefined {
  if (attempt > REDIS_RECONNECT_MAX_ATTEMPTS) {
    logRedisState('warn', 'redis_reconnect_circuit_open', `[REDIS] reconnect_circuit_open attempts=${attempt - 1}`);
    return undefined;
  }
  const delay = Math.min(REDIS_RECONNECT_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1), REDIS_RECONNECT_MAX_DELAY_MS);
  logRedisState('warn', 'redis_reconnect_backoff', `[REDIS] reconnect_backoff attempt=${attempt} delayMs=${delay}`);
  return delay;
}

function getRedisCacheReconnectDelay(attempt: number): false | number {
  return getRedisReconnectDelay(attempt) ?? false;
}

function shouldRejectUnauthorizedRedisTls(): boolean {
  return process.env.REDIS_TLS_REJECT_UNAUTHORIZED !== 'false';
}

function getRedisTlsServerName(): string | undefined {
  const host = process.env.REDIS_HOST;
  if (!host || host === 'localhost' || host === '127.0.0.1') return undefined;
  return host;
}

function getRedisCacheSocketOptions() {
  const host = process.env.REDIS_HOST;
  if (!host) return undefined;
  return process.env.REDIS_TLS === 'true'
    ? {
        host,
        port: Number(process.env.REDIS_PORT || 6379),
        tls: true as const,
        servername: getRedisTlsServerName(),
        rejectUnauthorized: shouldRejectUnauthorizedRedisTls(),
        connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
        reconnectStrategy: getRedisCacheReconnectDelay,
      }
    : {
        host,
        port: Number(process.env.REDIS_PORT || 6379),
        connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
        reconnectStrategy: getRedisCacheReconnectDelay,
      };
}

function getBullmqRedisConnectionOptions() {
  const host = process.env.REDIS_HOST || 'localhost';
  const base = {
    host,
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy: getRedisReconnectDelay,
  };

  return process.env.REDIS_TLS === 'true'
    ? {
        ...base,
        tls: {
          servername: getRedisTlsServerName(),
          rejectUnauthorized: shouldRejectUnauthorizedRedisTls(),
        },
      }
    : base;
}

function attachRedisClientEventHandlers(client: { on?: (event: string, handler: (...args: unknown[]) => void) => void } | undefined, source: 'cache' | 'bullmq') {
  if (!client || typeof client.on !== 'function') return;

  client.on('error', (err: unknown) => {
    logRedisState(
      'error',
      `${source}_redis_client_error:${classifyRedisError(err)}`,
      `[${source.toUpperCase()}] redis_client_error - keeping_process_alive`,
      err,
    );
  });

  client.on('end', () => {
    logRedisState('warn', `${source}_redis_client_end`, `[${source.toUpperCase()}] redis_client_closed`);
  });
}

// Log Redis initialization status at startup with throttling and without secrets.
if (process.env.REDIS_ENABLED === 'false') {
  logRedisState('warn', 'redis_disabled', '[REDIS] disabled_intentionally - cache_fallback_memory bullmq_unavailable productionReady=false');
} else if (process.env.REDIS_HOST && process.env.REDIS_HOST !== 'localhost') {
  logRedisState('log', 'redis_attempting_connection', `[REDIS] attempting_connection remote_host_configured port=${process.env.REDIS_PORT || 6379}`);
} else if (!process.env.REDIS_HOST) {
  logRedisState('warn', 'redis_missing_host', '[REDIS] no_host_configured - cache_fallback_memory productionReady=false');
} else {
  logRedisState('warn', 'redis_localhost', '[REDIS] localhost_configured - not_production_ready');
}

@Module({
  controllers: [AppController],
  imports: [
    // Configuration - loads env files from absolute, cwd-independent paths.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: getApiEnvFilePaths(),
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

    ...(process.env.REDIS_ENABLED !== 'false' && (process.env.BULLMQ_ENABLED === 'true' || process.env.CAMPAIGNS_DISPATCH_ENABLED === 'true')
      ? [
          BullModule.forRoot({
            connection: getBullmqRedisConnectionOptions(),
            defaultJobOptions: {
              removeOnComplete: 1000,
              removeOnFail: 5000,
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 5000,
              },
            },
          }),
        ]
      : []),

    // Cache (Redis com fallback local in-memory se falhar ou estiver sem credenciais)
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => {
        try {
          if (process.env.REDIS_ENABLED === 'false') {
            logRedisState('warn', 'cache_redis_disabled', '[CACHE] forced_in_memory - redis_disabled_intentionally productionReady=false');
            return {};
          }
          if (!process.env.REDIS_HOST) {
            logRedisState('warn', 'cache_no_redis_host', '[CACHE] fallback_in_memory - no_redis_host productionReady=false');
            return {};
          }
          const store = await redisStore({
            socket: getRedisCacheSocketOptions(),
            password: process.env.REDIS_PASSWORD || undefined,
            ttl: 60000, // Default 60s
          }) as { client: { ping(): Promise<string> } };
          attachRedisClientEventHandlers((store as { client?: { on?: (event: string, handler: (...args: unknown[]) => void) => void } }).client, 'cache');
          // Testa ping
          await store.client.ping();
          logRedisState('log', 'cache_redis_connected', '[CACHE] redis_connected');
          return { store };
        } catch (err) {
          logRedisState('warn', `cache_redis_connection_failed:${classifyRedisError(err)}`, '[CACHE] redis_connection_failed - using_fallback_in_memory productionReady=false', err);
          return {};
        }
      },
    }),

    // Events
    EventEmitterModule.forRoot({
      global: true,
      wildcard: true,
    }),

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

    // Add-on Features
    WhatsAppChannelModule,
    AiAgentModule,
    CampaignsModule,
    ChatModule,
    MailModule,
    PrintingModule,
    MarketplaceModule,
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
