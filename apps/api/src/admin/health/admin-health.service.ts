import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AdminHealthService {
  private readonly logger = new Logger('AdminHealthService');

  constructor(private readonly prisma: PrismaService) {}

  async getSystemHealth() {
    const dbStartedAt = Date.now();
    const databaseOk = await this.prisma.isHealthy();
    const redisEnabled = process.env.REDIS_ENABLED !== 'false';
    const redisHost = process.env.REDIS_HOST;
    const redisConfigured = Boolean(redisHost && redisHost !== 'localhost' && redisHost !== '127.0.0.1');
    const bullmqEnabled = process.env.BULLMQ_ENABLED === 'true';
    const campaignsDispatchEnabled = process.env.CAMPAIGNS_DISPATCH_ENABLED === 'true';
    const marketplacePollingEnabled = process.env.MARKETPLACE_IFOOD_POLLING_FALLBACK_ENABLED === 'true';
    const marketplaceTenantIds = databaseOk
      ? await this.prisma.tenant.findMany({ select: { id: true }, orderBy: { id: 'asc' }, take: 10_000 })
      : [];
    const marketplaceConnections = marketplaceTenantIds.length
      ? await this.prisma.marketplaceConnection.findMany({
        where: { tenantId: { in: marketplaceTenantIds.map((tenant) => tenant.id) }, provider: 'IFOOD' },
        select: {
          pollingStatus: true,
          pollingLastSuccessAt: true,
          pollingBlockedReason: true,
          settingsJson: true,
        },
      })
      : [];
    const pollingConnections = marketplaceConnections.filter((connection) => (
      typeof connection.settingsJson === 'object'
      && connection.settingsJson !== null
      && !Array.isArray(connection.settingsJson)
      && 'pollingFallbackEnabled' in connection.settingsJson
      && connection.settingsJson.pollingFallbackEnabled === true
    ));
    const pollingStaleThreshold = Date.now() - 90_000;
    const stalePollingConnections = pollingConnections.filter((connection) => (
      !connection.pollingLastSuccessAt || connection.pollingLastSuccessAt.getTime() < pollingStaleThreshold
    ));
    const readinessReasons = [
      !databaseOk ? 'Database health check failed' : null,
      !redisEnabled ? 'REDIS_ENABLED=false' : null,
      redisEnabled && !redisHost ? 'REDIS_HOST missing' : null,
      redisEnabled && redisHost && !redisConfigured ? 'REDIS_HOST points to localhost' : null,
      !bullmqEnabled ? 'BULLMQ_ENABLED=false' : null,
      marketplacePollingEnabled && (!redisEnabled || !bullmqEnabled)
        ? 'iFood polling requires Redis and BullMQ'
        : null,
      marketplacePollingEnabled && pollingConnections.some((connection) => connection.pollingStatus === 'BLOCKED')
        ? 'One or more iFood polling connections are blocked'
        : null,
      process.env.NODE_ENV === 'production' && !redisEnabled ? 'Production requires REDIS_ENABLED=true' : null,
      process.env.NODE_ENV === 'production' && !bullmqEnabled ? 'Production requires BULLMQ_ENABLED=true' : null,
    ].filter((reason): reason is string => Boolean(reason));
    const productionReady = databaseOk && redisEnabled && redisConfigured && bullmqEnabled && readinessReasons.length === 0;

    return {
      status: productionReady ? 'ok' : 'degraded',
      checkedAt: new Date().toISOString(),
      services: {
        database: {
          ok: databaseOk,
          latencyMs: Date.now() - dbStartedAt,
        },
        redis: {
          enabled: redisEnabled,
          configured: redisConfigured,
          connected: null,
          lastError: redisEnabled && !redisConfigured ? 'Redis is enabled but not production configured' : null,
        },
        bullmq: {
          enabled: bullmqEnabled,
          connected: null,
          productionReady: bullmqEnabled && redisConfigured,
          reason: bullmqEnabled ? null : 'BULLMQ_ENABLED=false',
        },
        campaignsDispatch: {
          enabled: campaignsDispatchEnabled,
        },
        marketplacePolling: {
          enabled: marketplacePollingEnabled,
          configuredConnections: pollingConnections.length,
          healthyConnections: pollingConnections.filter((connection) => connection.pollingStatus === 'HEALTHY').length,
          degradedConnections: pollingConnections.filter((connection) => connection.pollingStatus === 'DEGRADED').length,
          blockedConnections: pollingConnections.filter((connection) => connection.pollingStatus === 'BLOCKED').length,
          staleConnections: stalePollingConnections.length,
        },
      },
      productionReadiness: {
        productionReady,
        reasons: readinessReasons,
        nodeEnv: process.env.NODE_ENV ?? 'development',
        storageDriver: process.env.MEDIA_STORAGE_PROVIDER || process.env.MEDIA_STORAGE_DRIVER || process.env.STORAGE_DRIVER || 'local',
        billingPaymentsEnabled: process.env.BILLING_PAYMENTS_ENABLED === 'true',
        billingGatewayProvider: process.env.BILLING_GATEWAY_PROVIDER ?? 'manual',
        billingGatewayMode: process.env.BILLING_GATEWAY_MODE ?? 'disabled',
        redis: {
          configured: redisConfigured,
          enabled: redisEnabled,
          hostClass: redisConfigured ? 'remote' : redisHost ? 'local_or_invalid' : 'missing',
        },
        bullmq: {
          enabled: bullmqEnabled,
          productionReady: bullmqEnabled && redisConfigured,
        },
        queues: [
          {
            name: 'campaign-dispatch',
            critical: false,
            status: campaignsDispatchEnabled ? (bullmqEnabled && redisConfigured ? 'configured' : 'blocked') : 'disabled',
            waiting: null,
            active: null,
            failed: null,
            delayed: null,
            lastError: campaignsDispatchEnabled && (!bullmqEnabled || !redisConfigured) ? 'Queue cannot run without BullMQ and production Redis' : null,
          },
          {
            name: 'marketplace-event-ingest',
            critical: marketplacePollingEnabled,
            status: marketplacePollingEnabled ? (bullmqEnabled && redisConfigured ? 'configured' : 'blocked') : 'disabled',
            waiting: null,
            active: null,
            failed: null,
            delayed: null,
            lastError: marketplacePollingEnabled && (!bullmqEnabled || !redisConfigured)
              ? 'iFood polling cannot run without BullMQ and production Redis'
              : null,
          },
        ],
      },
    };
  }

  /**
   * Check health/status of a specific tenant.
   */
  async checkTenantHealth(tenantId: string) {
    const [productsCount, settings, lastOrder] = await Promise.all([
      this.prisma.product.count({ where: { tenantId, isActive: true } }),
      this.prisma.tenantSettings.findUnique({ where: { tenantId } }),
      this.prisma.order.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const issues = [];

    if (productsCount === 0) {
      issues.push({ code: 'EMPTY_CATALOG', severity: 'high', message: 'Nenhum produto ativo cadastrado.' });
    }

    if (!settings?.street || !settings?.city) {
      issues.push({ code: 'MISSING_ADDRESS', severity: 'high', message: 'Endereço da loja incompleto.' });
    }

    const hasPayment = settings?.pixKey || settings?.mercadoPagoAccessToken || 
                      (settings?.paymentMethods && (settings.paymentMethods as string[]).length > 0);
    
    if (!hasPayment) {
      issues.push({ code: 'NO_PAYMENT_CONFIG', severity: 'critical', message: 'Nenhum método de pagamento configurado.' });
    }

    return {
      tenantId,
      score: this.calculateScore(issues),
      issues,
      lastOrderAt: lastOrder?.createdAt || null,
      catalogSize: productsCount,
    };
  }

  private calculateScore(issues: Array<{ severity: string }>) {
    let base = 100;
    issues.forEach(issue => {
      if (issue.severity === 'critical') base -= 40;
      if (issue.severity === 'high') base -= 20;
      if (issue.severity === 'medium') base -= 10;
    });
    return Math.max(0, base);
  }

  /**
   * Dashboard summary of all tenants health.
   */
  async getHealthOverview() {
    const tenants = await this.prisma.tenant.findMany({
      select: { id: true, name: true, slug: true },
    });

    const healths = await Promise.all(tenants.map(t => this.checkTenantHealth(t.id)));
    
    return tenants.map((t, index) => ({
      ...t,
      health: healths[index],
    }));
  }
}
