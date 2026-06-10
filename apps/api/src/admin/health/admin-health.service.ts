import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AdminHealthService {
  private readonly logger = new Logger('AdminHealthService');

  constructor(private readonly prisma: PrismaService) {}

  async getSystemHealth() {
    const dbStartedAt = Date.now();
    const databaseOk = await this.prisma.isHealthy();

    return {
      status: databaseOk ? 'ok' : 'degraded',
      checkedAt: new Date().toISOString(),
      services: {
        database: {
          ok: databaseOk,
          latencyMs: Date.now() - dbStartedAt,
        },
        redis: {
          enabled: process.env.REDIS_ENABLED !== 'false',
          configured: Boolean(process.env.REDIS_HOST && process.env.REDIS_HOST !== 'localhost'),
        },
        bullmq: {
          enabled: process.env.BULLMQ_ENABLED === 'true',
        },
        campaignsDispatch: {
          enabled: process.env.CAMPAIGNS_DISPATCH_ENABLED === 'true',
        },
      },
      productionReadiness: {
        nodeEnv: process.env.NODE_ENV ?? 'development',
        storageDriver: process.env.MEDIA_STORAGE_PROVIDER || process.env.MEDIA_STORAGE_DRIVER || process.env.STORAGE_DRIVER || 'local',
        billingPaymentsEnabled: process.env.BILLING_PAYMENTS_ENABLED === 'true',
        billingGatewayProvider: process.env.BILLING_GATEWAY_PROVIDER ?? 'manual',
        billingGatewayMode: process.env.BILLING_GATEWAY_MODE ?? 'disabled',
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
