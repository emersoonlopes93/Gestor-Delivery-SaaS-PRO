import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { TenantContextService } from '../common/context/tenant-context.service';

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
  public readonly tenantClient: any;

  constructor(private readonly tenantContext: TenantContextService) {
    super({
      log: [
        { level: 'error', emit: 'stdout' },
        { level: 'warn', emit: 'stdout' },
      ],
    });

    this.tenantClient = this.extendClient();
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connection established');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Database connection failed on startup (app will continue running). ${message}`,
      );
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

  private extendClient() {
    const tenantContext = this.tenantContext;
    return this.$extends({
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }) {
            const tenantId = tenantContext.getTenantId();

            // Only apply isolation if we have a tenant context
            // Models like AdminUser, Tenant, AdminRole, AdminPermission are NOT isolated by tenantId
            const excludedModels = ['Tenant', 'AdminUser', 'AdminRole', 'AdminPermission', 'AdminRolePermission', 'AdminUserRole'];
            const isTenantScoped = !excludedModels.includes(model);

            if (tenantId && isTenantScoped) {
              const op = operation as string;
              const a = args as any;

              // Read operations
              if (['findMany', 'findFirst', 'findUnique', 'count', 'aggregate', 'groupBy'].includes(op)) {
                // Change findUnique to findFirst to allow combined where with tenantId
                const finalOp = op === 'findUnique' ? 'findFirst' : op;
                a.where = { ...a.where, tenantId };
                
                // If it was findUnique, we MUST use findFirst because findUnique only accepts unique fields
                if (op === 'findUnique') {
                   return query(a);
                }
              }
              
              // Write operations (where-based)
              else if (['update', 'updateMany', 'upsert', 'delete', 'deleteMany'].includes(op)) {
                a.where = { ...a.where, tenantId };
              }
              
              // Creation
              else if (op === 'create') {
                a.data = { ...a.data, tenantId };
              }
              
              else if (op === 'createMany') {
                if (Array.isArray(a.data)) {
                  a.data = a.data.map((item: any) => ({ ...item, tenantId }));
                } else {
                  a.data = { ...a.data, tenantId };
                }
              }
            }

            return query(args);
          },
        },
      },
    });
  }
}
