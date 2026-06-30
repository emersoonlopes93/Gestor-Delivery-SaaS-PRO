import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { BillingEntitlementsService } from '../billing/billing-entitlements.service';
import { TenantBillingResolverService } from '../billing/tenant-billing-resolver.service';
import { RbacService } from '../rbac/rbac.service';
import {
  FEATURE_CATALOG,
  FEATURE_CATALOG_BY_KEY,
  MODULE_CATALOG,
  type BillingEntitlementFlagKey,
  type CatalogFeatureKey,
  type FeatureCatalogEntry,
} from '@gestor/core';
import type { TenantCapabilitiesResponse, TenantCapabilityDecision } from '@gestor/types';

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

type FeatureResolutionContext = {
  billingState: Awaited<ReturnType<TenantBillingResolverService['getTenantBillingState']>>;
  entitlements: Awaited<ReturnType<BillingEntitlementsService['resolveTenantEntitlements']>>;
  permissions: string[];
  moduleAccessMap: Map<string, boolean>;
  activeOverrideMap: Map<string, ActiveOverrideRow>;
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
      const primaryReason = relatedDecisions.find((decision) => decision.enabled)?.reason
        ?? relatedDecisions[0]?.reason
        ?? 'plan_not_allowed';

      return [
        moduleEntry.key,
        {
          enabled,
          reason: primaryReason,
          source: relatedDecisions.find((decision) => decision.source)?.source ?? 'feature_catalog',
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

    const activeOverride = this.resolveActiveOverride(feature, context.activeOverrideMap);

    if ((feature.status === 'internal' || feature.status === 'coming_soon') && activeOverride?.enabled !== true) {
      return { enabled: false, reason: 'beta_disabled', source: feature.status };
    }

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
    const [billingState, moduleAccessRows, entitlements, permissions] = await Promise.all([
      this.tenantBillingResolver.getTenantBillingState(tenantId),
      this.getTenantModuleAccessRows(tenantId),
      this.billingEntitlementsService.resolveTenantEntitlements(tenantId),
      userId ? this.rbacService.getUserPermissions(userId) : Promise.resolve<string[]>([]),
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
    };
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
}
