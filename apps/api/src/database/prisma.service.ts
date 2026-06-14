import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { TenantContextService } from '../common/context/tenant-context.service';
import {
  resolveBillingDatabasePreflightMode,
  runBillingDatabasePreflight,
} from '../billing/billing-database-preflight';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger('PrismaService');

  /**
   * Accessible as this.prisma.tenantClient
   * Automatically isolates data based on current context.
   */
  public readonly tenantClient: PrismaClient;

  constructor(public readonly tenantContext: TenantContextService) {
    const options: Prisma.PrismaClientOptions = {
      log: [
        { level: 'error', emit: 'stdout' },
        { level: 'warn', emit: 'stdout' },
      ],
    };

    super(options);

    this.$use(async (params, next) => {
      const tenantId = this.tenantContext.getTenantId();

      // Only apply isolation if we have a tenant context
      // Models like AdminUser, Tenant, AdminRole, AdminPermission are NOT isolated by tenantId
      const excludedModels = [
        'Tenant',
        'BusinessGroup',
        'AdminUser',
        'AdminRole',
        'AdminPermission',
        'AdminRolePermission',
        'AdminUserRole',
        'TenantPermission',
        'TenantRolePermission',
        'TenantUserRole',
        'Plan',
        'TenantSubscription',
        'CampaignDispatch',
        'ChatMessage',
        'SystemConfig',
        'BillingPlan',
        'BillingRevenueTier',
        'BillingPlanModule',
        'BillingModuleAddon',
        'BillingSettings',
        'InvoiceItem',
        'MediaAsset',
        'MediaCategory',
        'AuthSession',
        'ExternalWebhookEvent',
        'BillingRuleVersion',
      ];

      const model = params.model ?? '';
      const isTenantScoped = tenantId != null && tenantId !== '' && !excludedModels.includes(model);

      if (!isTenantScoped) {
        return next(params);
      }

      const isRecord = (value: unknown): value is Record<string, unknown> =>
        typeof value === 'object' && value !== null;

      const ensureRecord = (value: unknown): Record<string, unknown> => (isRecord(value) ? value : {});

      const argsRecord = ensureRecord(params.args);

      // Read operations
      if (
        [
          'findMany',
          'findFirst',
          'findUnique',
          'count',
          'aggregate',
          'groupBy',
        ].includes(params.action)
      ) {
        const where = ensureRecord(argsRecord.where);
        
        // Achata chaves compostas no where (ex: tenantId_phone: { tenantId, phone } -> { tenantId, phone })
        for (const key of Object.keys(where)) {
          const val = where[key];
          if (key.includes('_') && val && typeof val === 'object' && !Array.isArray(val)) {
            const valKeys = Object.keys(val);
            const isPrismaFilter = valKeys.some(k => ['equals', 'in', 'not', 'notIn', 'lt', 'lte', 'gt', 'gte', 'contains', 'startsWith', 'endsWith', 'mode'].includes(k));
            if (!isPrismaFilter) {
              Object.assign(where, val);
              delete where[key];
            }
          }
        }

        argsRecord.where = { ...where, tenantId };

        // findUnique cannot accept non-unique fields; convert to findFirst
        if (params.action === 'findUnique') {
          params.action = 'findFirst';
        }
      }

      // Write operations (where-based)
      else if (['update', 'updateMany', 'upsert', 'delete', 'deleteMany'].includes(params.action)) {
        const where = ensureRecord(argsRecord.where);

        // Achata chaves compostas no where para operações de escrita também
        for (const key of Object.keys(where)) {
          const val = where[key];
          if (key.includes('_') && val && typeof val === 'object' && !Array.isArray(val)) {
            const valKeys = Object.keys(val);
            const isPrismaFilter = valKeys.some(k => ['equals', 'in', 'not', 'notIn', 'lt', 'lte', 'gt', 'gte', 'contains', 'startsWith', 'endsWith', 'mode'].includes(k));
            if (!isPrismaFilter) {
              Object.assign(where, val);
              delete where[key];
            }
          }
        }

        argsRecord.where = { ...where, tenantId };
      }

      // Creation
      else if (params.action === 'create') {
        const data = ensureRecord(argsRecord.data);
        argsRecord.data = { ...data, tenantId };
      }

      else if (params.action === 'createMany') {
        if (Array.isArray(argsRecord.data)) {
          argsRecord.data = argsRecord.data.map((item) => ({ ...ensureRecord(item), tenantId }));
        } else {
          const data = ensureRecord(argsRecord.data);
          argsRecord.data = { ...data, tenantId };
        }
      }

      params.args = argsRecord;
      return next(params);
    });

    this.tenantClient = this;
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connection established');
      await runBillingDatabasePreflight({
        prisma: this,
        mode: resolveBillingDatabasePreflightMode(process.env),
        logger: this.logger,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Database startup check failed. ${message}`);
      throw err;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }

  /**
   * Health check — returns true if the database is reachable.
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  // Tenant isolation is implemented via Prisma middleware ($use) to preserve PrismaClient typing.
}
