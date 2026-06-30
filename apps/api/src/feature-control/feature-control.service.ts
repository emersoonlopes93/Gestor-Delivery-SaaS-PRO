import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { BillingEntitlementsService } from '../billing/billing-entitlements.service';
import { TenantBillingResolverService } from '../billing/tenant-billing-resolver.service';
import { RbacService } from '../rbac/rbac.service';
import {
  FEATURE_CATALOG,
  FEATURE_CATALOG_BY_KEY,
  MODULE_CATALOG,
  featureStatusToOperationalStatus,
  type BillingEntitlementFlagKey,
  type CatalogFeatureKey,
  type FeatureCatalogEntry,
  type FeatureOperationalStatus,
  type FeatureStatus,
} from '@gestor/core';
import type { TenantCapabilitiesResponse, TenantCapabilityDecision } from '@gestor/types';

const PLATFORM_AUDIT_TENANT_SLUG = '__platform_audit__';

type ResolveTenantFeatureInput = {
  tenantId: string;
  featureKey: string;
  userId?: string;
  requiredPermission?: string | string[];
};

type TenantModuleAccessRow = {
  module: string;
  enabled: boolean;
};

type ActiveOverrideRow = {
  enabled: boolean;
  reason: string;
  source: string;
};

type GlobalSettingRow = {
  featureKey: string;
  status: FeatureOperationalStatus;
  reason: string | null;
  updatedAt: Date;
  updatedBy: string | null;
};

type FeatureResolutionContext = {
  billingState: Awaited<ReturnType<TenantBillingResolverService['getTenantBillingState']>>;
  entitlements: Awaited<ReturnType<BillingEntitlementsService['resolveTenantEntitlements']>>;
  permissions: string[];
  moduleAccessMap: Map<string, boolean>;
  activeOverrideMap: Map<string, ActiveOverrideRow>;
  globalSettingsMap: Map<string, GlobalSettingRow>;
};

export type AdminFeatureCatalogItem = {
  featureKey: string;
  name: string;
  description?: string;
  category: string;
  essential: boolean;
  canDisable: boolean;
  catalogStatus: FeatureStatus;
  globalStatus: FeatureOperationalStatus;
  envFallbackKey?: string;
  moduleKey?: string;
  requiredPermission?: string[];
  updatedAt: Date | null;
  updatedBy: string | null;
};

type UpdateGlobalFeatureStatusInput = {
  featureKey: string;
  status: FeatureOperationalStatus;
  reason: string;
  adminId: string;
  ip?: string | null;
};

@Injectable()
export class FeatureControlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantBillingResolver: TenantBillingResolverService,
    private readonly billingEntitlementsService: BillingEntitlementsService,
    private readonly rbacService: RbacService,
  ) {}

  async resolveTenantFeature(input: ResolveTenantFeatureInput): Promise<TenantCapabilityDecision> {
    const feature = FEATURE_CATALOG_BY_KEY[input.featureKey as CatalogFeatureKey];
    if (!feature) {
      return { enabled: false, reason: 'unknown_feature' };
    }

    if (feature.essential) {
      return { enabled: true, reason: 'essential', source: 'feature_catalog' };
    }

    const context = await this.buildContext(input.tenantId, input.userId);
    return this.resolveTenantFeatureWithContext(input, context);
  }

  async getTenantCapabilities(tenantId: string, userId?: string): Promise<TenantCapabilitiesResponse> {
    const context = await this.buildContext(tenantId, userId);

    const featureEntries = FEATURE_CATALOG.map((feature) => [
      feature.key,
      this.resolveTenantFeatureWithContext(
        {
          tenantId,
          userId,
          featureKey: feature.key,
        },
        context,
      ),
    ] as const);

    const moduleEntries = MODULE_CATALOG.map((moduleEntry) => {
      const relatedFeatures = FEATURE_CATALOG.filter((feature) => feature.moduleKey === moduleEntry.key);
      const relatedDecisions = relatedFeatures.map((feature) =>
        this.resolveTenantFeatureWithContext(
          {
            tenantId,
            userId,
            featureKey: feature.key,
          },
          context,
        ),
      );

      const enabled = relatedDecisions.some((decision) => decision.enabled);
      const primaryDecision = relatedDecisions.find((decision) => decision.enabled) ?? relatedDecisions[0];

      return [
        moduleEntry.key,
        {
          enabled,
          reason: primaryDecision?.reason ?? 'plan_not_allowed',
          source: primaryDecision?.source ?? 'feature_catalog',
        },
      ] as const;
    });

    return {
      features: Object.fromEntries(featureEntries),
      modules: Object.fromEntries(moduleEntries),
      plan: {
        id: context.billingState.plan?.id ?? null,
        name: context.billingState.plan?.name ?? null,
        slug: context.billingState.plan?.slug ?? null,
        source: context.billingState.source ?? null,
      },
      permissions: context.permissions,
    };
  }

  getFeatureCatalog(): readonly FeatureCatalogEntry[] {
    return FEATURE_CATALOG;
  }

  async getAdminFeatureCatalog(): Promise<AdminFeatureCatalogItem[]> {
    const globalSettingsMap = await this.getGlobalSettingsMap();

    return FEATURE_CATALOG.map((feature) => {
      const globalSetting = globalSettingsMap.get(feature.key) ?? null;
      return {
        featureKey: feature.key,
        name: feature.name,
        description: feature.description,
        category: feature.category,
        essential: feature.essential,
        canDisable: feature.canDisable,
        catalogStatus: feature.status,
        globalStatus: this.resolveEffectiveGlobalStatus(feature, globalSetting),
        envFallbackKey: feature.envFallbackKey,
        moduleKey: feature.moduleKey,
        requiredPermission: this.normalizePermissions(feature.requiredPermission),
        updatedAt: globalSetting?.updatedAt ?? null,
        updatedBy: globalSetting?.updatedBy ?? null,
      };
    });
  }

  async updateGlobalFeatureStatus(input: UpdateGlobalFeatureStatusInput): Promise<AdminFeatureCatalogItem> {
    const feature = FEATURE_CATALOG_BY_KEY[input.featureKey as CatalogFeatureKey];
    if (!feature) {
      throw new BadRequestException('featureKey invalida.');
    }

    if (feature.essential || !feature.canDisable) {
      throw new BadRequestException('Feature essencial nao pode ter status global alterado.');
    }

    const reason = input.reason.trim();
    if (!reason) {
      throw new BadRequestException('reason e obrigatorio.');
    }

    const setting = await this.prisma.$transaction(async (tx) => {
      const previous = await tx.featureGlobalSetting.findUnique({
        where: { featureKey: feature.key },
      });

      const updated = await tx.featureGlobalSetting.upsert({
        where: { featureKey: feature.key },
        update: {
          status: input.status,
          reason,
          updatedBy: input.adminId,
        },
        create: {
          featureKey: feature.key,
          status: input.status,
          reason,
          updatedBy: input.adminId,
        },
      });

      const tenantId = await this.platformAuditTenantId(tx);
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: input.adminId,
          userType: 'admin',
          action: 'feature.global_status.update',
          resource: 'feature_control',
          details: {
            featureKey: feature.key,
            previousStatus: previous?.status ?? null,
            nextStatus: updated.status,
            reason,
          },
          ip: input.ip ?? null,
        },
      });

      return updated;
    });

    return {
      featureKey: feature.key,
      name: feature.name,
      description: feature.description,
      category: feature.category,
      essential: feature.essential,
      canDisable: feature.canDisable,
      catalogStatus: feature.status,
      globalStatus: this.resolveEffectiveGlobalStatus(feature, {
        featureKey: setting.featureKey,
        status: this.normalizeGlobalStatus(setting.status),
        reason: setting.reason,
        updatedAt: setting.updatedAt,
        updatedBy: setting.updatedBy,
      }),
      envFallbackKey: feature.envFallbackKey,
      moduleKey: feature.moduleKey,
      requiredPermission: this.normalizePermissions(feature.requiredPermission),
      updatedAt: setting.updatedAt,
      updatedBy: setting.updatedBy,
    };
  }

  private resolveTenantFeatureWithContext(
    input: ResolveTenantFeatureInput,
    context: FeatureResolutionContext,
  ): TenantCapabilityDecision {
    const feature = FEATURE_CATALOG_BY_KEY[input.featureKey as CatalogFeatureKey];
    if (!feature) {
      return { enabled: false, reason: 'unknown_feature' };
    }

    if (feature.essential) {
      return { enabled: true, reason: 'essential', source: 'feature_catalog' };
    }

    const globalSetting = context.globalSettingsMap.get(feature.key) ?? null;
    const globalStatus = this.resolveEffectiveGlobalStatus(feature, globalSetting);
    const globalSource = globalSetting ? 'feature_global_setting' : 'feature_catalog';

    if (globalStatus === 'disabled') {
      return { enabled: false, reason: 'global_disabled', source: globalSource };
    }

    if (globalStatus === 'internal') {
      return { enabled: false, reason: 'global_internal', source: globalSource };
    }

    if (globalStatus === 'coming_soon') {
      return { enabled: false, reason: 'coming_soon', source: globalSource };
    }

    const activeOverride = this.resolveActiveOverride(feature, context.activeOverrideMap);
    const availabilityResult = this.resolveFeatureAvailability(
      feature,
      context.billingState,
      context.entitlements,
      context.moduleAccessMap,
    );
    const effectiveAvailability = this.applyOverrideToAvailability(availabilityResult, activeOverride);
    if (!effectiveAvailability.enabled) {
      return effectiveAvailability;
    }

    const permissionDecision = this.resolvePermissionDecision(feature, input.requiredPermission, context.permissions);
    if (permissionDecision) {
      return permissionDecision;
    }

    const envDecision = this.resolveEnvFallback(feature);
    if (envDecision) {
      return envDecision;
    }

    if (globalStatus === 'beta' && effectiveAvailability.reason === 'enabled') {
      return {
        enabled: true,
        reason: 'global_beta',
        source: globalSource,
      };
    }

    return effectiveAvailability;
  }

  private async getTenantModuleAccessRows(tenantId: string): Promise<TenantModuleAccessRow[]> {
    return this.prisma.$queryRaw<TenantModuleAccessRow[]>`
      SELECT module, enabled
      FROM tenant_module_access
      WHERE tenant_id = ${tenantId}
    `;
  }

  private async buildContext(tenantId: string, userId?: string): Promise<FeatureResolutionContext> {
    const [billingState, moduleAccessRows, entitlements, permissions, globalSettingsMap] = await Promise.all([
      this.tenantBillingResolver.getTenantBillingState(tenantId),
      this.getTenantModuleAccessRows(tenantId),
      this.billingEntitlementsService.resolveTenantEntitlements(tenantId),
      userId ? this.rbacService.getUserPermissions(userId) : Promise.resolve<string[]>([]),
      this.getGlobalSettingsMap(),
    ]);

    return {
      billingState,
      entitlements,
      permissions,
      moduleAccessMap: new Map<string, boolean>(moduleAccessRows.map((row) => [row.module, row.enabled])),
      activeOverrideMap: new Map<string, ActiveOverrideRow>(
        entitlements.featureOverrides
          .filter((override) => override.isActiveNow)
          .map((override) => [
            override.featureKey,
            {
              enabled: override.enabled,
              reason: override.reason,
              source: override.source,
            },
          ]),
      ),
      globalSettingsMap,
    };
  }

  private async getGlobalSettingsMap(): Promise<Map<string, GlobalSettingRow>> {
    const rows = await this.prisma.featureGlobalSetting.findMany();
    return new Map<string, GlobalSettingRow>(
      rows.map((row) => [
        row.featureKey,
        {
          featureKey: row.featureKey,
          status: this.normalizeGlobalStatus(row.status),
          reason: row.reason,
          updatedAt: row.updatedAt,
          updatedBy: row.updatedBy,
        },
      ]),
    );
  }

  private resolveActiveOverride(
    feature: FeatureCatalogEntry,
    activeOverrideMap: Map<string, ActiveOverrideRow>,
  ): ActiveOverrideRow | null {
    if (!feature.billingEntitlementKey) {
      return null;
    }

    const activeOverride = activeOverrideMap.get(feature.billingEntitlementKey);
    return activeOverride ?? null;
  }

  private resolveFeatureAvailability(
    feature: FeatureCatalogEntry,
    billingState: Awaited<ReturnType<TenantBillingResolverService['getTenantBillingState']>>,
    entitlements: Awaited<ReturnType<BillingEntitlementsService['resolveTenantEntitlements']>>,
    moduleAccessMap: Map<string, boolean>,
  ): TenantCapabilityDecision {
    if (feature.billingEntitlementFlagKey) {
      const allowed = this.readBillingEntitlementFlag(entitlements.flags, feature.billingEntitlementFlagKey);
      if (!allowed) {
        return {
          enabled: false,
          reason: 'plan_not_allowed',
          source: 'billing_entitlements',
        };
      }

      return {
        enabled: true,
        reason: 'enabled',
        source: 'billing_entitlements',
      };
    }

    if (feature.moduleKey) {
      const planEnabled = billingState.allowAllModules || billingState.includedModules.includes(feature.moduleKey);
      const tenantAccess = moduleAccessMap.get(feature.moduleKey);
      const tenantEnabled = tenantAccess === true;

      if (!planEnabled && !tenantEnabled) {
        return {
          enabled: false,
          reason: 'plan_not_allowed',
          source: billingState.source,
        };
      }

      return {
        enabled: true,
        reason: 'enabled',
        source: planEnabled ? billingState.source : 'tenant_module_access',
      };
    }

    return {
      enabled: true,
      reason: 'enabled',
      source: 'feature_catalog',
    };
  }

  private resolvePermissionDecision(
    feature: FeatureCatalogEntry,
    requiredPermission: string | string[] | undefined,
    permissions: string[],
  ): TenantCapabilityDecision | null {
    const permissionsToCheck = requiredPermission ?? feature.requiredPermission;
    if (!permissionsToCheck) {
      return null;
    }

    const required = Array.isArray(permissionsToCheck) ? permissionsToCheck : [permissionsToCheck];
    const hasAllRequired = required.every((permission) => permissions.includes(permission));

    if (hasAllRequired) {
      return null;
    }

    return {
      enabled: false,
      reason: 'missing_permission',
      source: 'rbac',
    };
  }

  private resolveEnvFallback(feature: FeatureCatalogEntry): TenantCapabilityDecision | null {
    if (!feature.envFallbackKey) {
      return null;
    }

    const rawValue = process.env[feature.envFallbackKey];
    if (typeof rawValue === 'string' && rawValue.trim().toLowerCase() === 'false') {
      return {
        enabled: false,
        reason: 'env_disabled',
        source: feature.envFallbackKey,
      };
    }

    return null;
  }

  private readBillingEntitlementFlag(
    flags: Record<BillingEntitlementFlagKey, boolean>,
    flagKey: BillingEntitlementFlagKey,
  ): boolean {
    return Boolean(flags[flagKey]);
  }

  private applyOverrideToAvailability(
    availability: TenantCapabilityDecision,
    activeOverride: ActiveOverrideRow | null,
  ): TenantCapabilityDecision {
    if (!activeOverride) {
      return availability;
    }

    if (!activeOverride.enabled) {
      return {
        enabled: false,
        reason: 'tenant_disabled',
        source: activeOverride.source,
      };
    }

    if (!availability.enabled) {
      return {
        enabled: true,
        reason: 'tenant_enabled_override',
        source: activeOverride.source,
      };
    }

    return {
      enabled: true,
      reason: 'tenant_enabled_override',
      source: activeOverride.source,
    };
  }

  private resolveEffectiveGlobalStatus(
    feature: FeatureCatalogEntry,
    globalSetting: GlobalSettingRow | null,
  ): FeatureOperationalStatus {
    if (globalSetting) {
      return globalSetting.status;
    }
    return featureStatusToOperationalStatus(feature.status);
  }

  private normalizeGlobalStatus(status: string): FeatureOperationalStatus {
    if (
      status === 'enabled'
      || status === 'disabled'
      || status === 'beta'
      || status === 'internal'
      || status === 'coming_soon'
    ) {
      return status;
    }
    return 'disabled';
  }

  private normalizePermissions(permission: string | string[] | undefined): string[] | undefined {
    if (!permission) {
      return undefined;
    }
    return Array.isArray(permission) ? permission : [permission];
  }

  private async platformAuditTenantId(client: Pick<Prisma.TransactionClient, 'tenant'>): Promise<string> {
    const tenant = await client.tenant.upsert({
      where: { slug: PLATFORM_AUDIT_TENANT_SLUG },
      update: {},
      create: { name: 'Platform Audit', slug: PLATFORM_AUDIT_TENANT_SLUG, status: 'active' },
      select: { id: true },
    });
    return tenant.id;
  }
}
