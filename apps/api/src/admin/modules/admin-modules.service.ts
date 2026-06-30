import { Injectable } from '@nestjs/common';
import { MODULE_CATALOG } from '@gestor/core';
import { PrismaService } from '../../database/prisma.service';
import { TenantBillingResolverService } from '../../billing/tenant-billing-resolver.service';

interface ModuleAccess {
  id: string;
  module: string;
  enabled: boolean;
}

type ModuleAccessRow = {
  id: string;
  module: string;
  enabled: boolean;
};

@Injectable()
export class AdminModulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantBillingResolver: TenantBillingResolverService,
  ) {}

  getAvailableModules() {
    return MODULE_CATALOG;
  }

  async getTenantModules(tenantId: string) {
    const entitlements = await this.tenantBillingResolver.resolveTenantEntitlements(tenantId);
    const access = await this.prisma.$queryRaw<ModuleAccessRow[]>`
      SELECT id, module, enabled
      FROM tenant_module_access
      WHERE tenant_id = ${tenantId}
    `;

    const available = this.getAvailableModules();

    return available.map((moduleEntry) => ({
      ...moduleEntry,
      enabled:
        entitlements.allowAllModules ||
        entitlements.includedModules.includes(moduleEntry.key) ||
        access.find((row) => row.module === moduleEntry.key)?.enabled ||
        false,
      accessId: access.find((row) => row.module === moduleEntry.key)?.id,
      source:
        entitlements.allowAllModules || entitlements.includedModules.includes(moduleEntry.key)
          ? entitlements.source
          : 'legacy_access',
    }));
  }

  async updateTenantModules(tenantId: string, modules: { module: string; enabled: boolean }[]) {
    const result: Array<{ id: string; tenantId: string; module: string; enabled: boolean }> = [];

    for (const { module, enabled } of modules) {
      const rows = await this.prisma.$queryRaw<ModuleAccessRow[]>`
        INSERT INTO tenant_module_access (id, tenant_id, module, enabled, created_at, updated_at)
        VALUES (gen_random_uuid(), ${tenantId}, ${module}, ${enabled}, NOW(), NOW())
        ON CONFLICT (tenant_id, module)
        DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()
        RETURNING id, module, enabled
      `;

      const row = rows[0];
      if (row) {
        result.push({ id: row.id, tenantId, module: row.module, enabled: row.enabled });
      }
    }

    return result;
  }

  async hasModuleAccess(tenantId: string, module: string): Promise<boolean> {
    const entitlements = await this.tenantBillingResolver.resolveTenantEntitlements(tenantId);
    if (entitlements.allowAllModules || entitlements.includedModules.includes(module)) {
      return true;
    }

    const rows = await this.prisma.$queryRaw<Pick<ModuleAccess, 'enabled'>[]>`
      SELECT enabled
      FROM tenant_module_access
      WHERE tenant_id = ${tenantId} AND module = ${module}
      LIMIT 1
    `;

    const access = rows[0];
    return access?.enabled ?? false;
  }
}
