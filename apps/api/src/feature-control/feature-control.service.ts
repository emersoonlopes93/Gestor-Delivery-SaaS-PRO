/* eslint-disable @typescript-eslint/no-unused-vars */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { BillingEntitlementsService } from '../billing/billing-entitlements.service';
import { TenantBillingResolverService } from '../billing/tenant-billing-resolver.service';
import { RbacService } from '../rbac/rbac.service';
import {
  FEATURE_CATALOG,
  FEATURE_CATALOG_BY_KEY,
  FEATURE_PRESETS,
  FEATURE_PRESET_BY_KEY,
  MODULE_CATALOG,
  featureStatusToOperationalStatus,
  type BillingEntitlementFlagKey,
  type CatalogFeatureKey,
  type FeatureCatalogEntry,
  type FeatureOperationalStatus,
  type FeaturePresetKey,
  type FeatureStatus,
  TENANT_ACTION_CAPABILITIES,
  type TenantActionCapabilityKey,
} from '@gestor/core';
import type {
  AdminFeatureCatalogItem,
  AdminTenantFeatureItem,
  AdminTenantFeaturesResponse,
  FeaturePresetPreviewResponse,
  FeatureTenantOverrideMode,
  TenantCapabilitiesResponse,
  TenantCapabilityDecision,
} from '@gestor/types';

const PLATFORM_AUDIT_TENANT_SLUG = '__platform_audit__';

type ResolveTenantFeatureInput = {
  tenantId: string;
  featureKey: string;
  userId?: string;
  requiredPermission?: string | string[];
  /**
   * The tenant-admin inventory is a configuration view, not a login session
   * for the platform administrator who requested it. It must therefore show
   * whether the tenant can receive the feature without accidentally testing
   * the SaaS admin id against tenant-scoped roles. User-facing capability
   * endpoints keep this disabled and continue to enforce RBAC.
   */
  skipUserPermissionCheck?: boolean;
};

type TenantModuleAccessRow = {
  module: string;
  enabled: boolean;
};

type LegacyOverrideRow = {
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

type TenantOverrideRow = {
  featureKey: string;
  mode: FeatureTenantOverrideMode;
  reason: string | null;
  expiresAt: Date | null;
  updatedAt: Date;
  updatedBy: string | null;
};

type EffectiveOverrideRow = {
  mode: 'enabled' | 'disabled';
  reason: string | null;
  source: string;
};

type FeatureResolutionContext = {
  billingState: Awaited<ReturnType<TenantBillingResolverService['getTenantBillingState']>>;
  entitlements: Awaited<ReturnType<BillingEntitlementsService['resolveTenantEntitlements']>>;
  permissions: string[];
  moduleAccessMap: Map<string, boolean>;
  legacyOverrideMap: Map<string, LegacyOverrideRow>;
  globalSettingsMap: Map<string, GlobalSettingRow>;
  tenantOverrideMap: Map<string, TenantOverrideRow>;
};

type UpdateGlobalFeatureStatusInput = {
  featureKey: string;
  status: FeatureOperationalStatus;
  reason: string;
  adminId: string;
  ip?: string | null;
};

type UpdateTenantFeatureOverrideInput = {
  tenantId: string;
  featureKey: string;
  mode: FeatureTenantOverrideMode;
  reason?: string;
  expiresAt?: Date | null;
  adminId: string;
  ip?: string | null;
};

type PresetPreviewScope = 'global' | 'tenant';

type PreviewPresetInput = {
  presetKey: FeaturePresetKey;
  scope: PresetPreviewScope;
  tenantId?: string;
};

type ApplyPresetGlobalInput = {
  presetKey: FeaturePresetKey;
  reason: string;
  confirmation: string;
  adminId: string;
  ip?: string | null;
};

type ApplyPresetTenantInput = {
  presetKey: FeaturePresetKey;
  tenantId: string;
  reason: string;
  confirmation: string;
  adminId: string;
  ip?: string | null;
};

type PresetChange = FeaturePresetPreviewResponse['changes'][number];

@Injectable()
export class FeatureControlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantBillingResolver: TenantBillingResolverService,
    private readonly billingEntitlementsService: BillingEntitlementsService,
    private readonly rbacService: RbacService,
  ) {}

  getTenantActionCapability(actionKey: TenantActionCapabilityKey) {
    const capability = TENANT_ACTION_CAPABILITIES[actionKey];
    if (actionKey === 'baseMenu.import' && process.env.BASE_MENU_IMPORT_ENABLED?.trim().toLowerCase() === 'true') {
      return {
        ...capability,
        enabled: true,
        reason: 'enabled',
        source: 'BASE_MENU_IMPORT_ENABLED',
      } as const;
    }
    return capability;
  }

  async resolveTenantFeature(input: ResolveTenantFeatureInput): Promise<TenantCapabilityDecision> {
    const feature = this.requireFeature(input.featureKey);
    if (feature.essential) {
      return { enabled: true, reason: 'essential', source: 'feature_catalog' };
    }

    const context = await this.buildContext(input.tenantId, input.userId);
    return this.resolveTenantFeatureWithContext(input, context);
  }

  async getTenantCapabilities(tenantId: string, userId?: string): Promise<TenantCapabilitiesResponse> {
    const context = await this.buildContext(tenantId);

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
      actions: Object.fromEntries(
        (Object.keys(TENANT_ACTION_CAPABILITIES) as TenantActionCapabilityKey[])
          .map((actionKey) => [actionKey, this.getTenantActionCapability(actionKey)]),
      ) as TenantCapabilitiesResponse['actions'],
      plan: {
        id: context.billingState.plan?.id ?? null,
        name: context.billingState.plan?.name ?? null,
        slug: context.billingState.plan?.slug ?? null,
        source: context.billingState.source ?? null,
      },
      permissions: context.permissions,
    };
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

  async getTenantFeatureCatalog(tenantId: string): Promise<AdminTenantFeaturesResponse> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant nao encontrado.');
    }

    const context = await this.buildContext(tenantId);

    return {
      tenant,
      features: FEATURE_CATALOG.map((feature) => {
        const decision = this.resolveTenantFeatureWithContext(
          {
            tenantId,
            featureKey: feature.key,
            skipUserPermissionCheck: true,
          },
          context,
        );

        const globalSetting = context.globalSettingsMap.get(feature.key) ?? null;
        const tenantOverride = context.tenantOverrideMap.get(feature.key) ?? null;

        return {
          featureKey: feature.key,
          name: feature.name,
          description: feature.description,
          category: feature.category,
          essential: feature.essential,
          canDisable: feature.canDisable,
          catalogStatus: feature.status,
          globalStatus: this.resolveEffectiveGlobalStatus(feature, globalSetting),
          tenantOverride: tenantOverride?.mode ?? 'inherit',
          overrideReason: tenantOverride?.reason ?? null,
          overrideExpiresAt: tenantOverride?.expiresAt ?? null,
          effectiveEnabled: decision.enabled,
          reason: decision.reason,
          source: decision.source,
          moduleKey: feature.moduleKey,
          requiredPermission: this.normalizePermissions(feature.requiredPermission),
        } satisfies AdminTenantFeatureItem;
      }),
    };
  }

  async updateGlobalFeatureStatus(input: UpdateGlobalFeatureStatusInput): Promise<AdminFeatureCatalogItem> {
    const feature = this.requireMutableFeature(input.featureKey);
    const reason = this.requireReason(input.reason);

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
      globalStatus: this.normalizeGlobalStatus(setting.status),
      envFallbackKey: feature.envFallbackKey,
      moduleKey: feature.moduleKey,
      requiredPermission: this.normalizePermissions(feature.requiredPermission),
      updatedAt: setting.updatedAt,
      updatedBy: setting.updatedBy,
    };
  }

  async updateTenantFeatureOverride(input: UpdateTenantFeatureOverrideInput): Promise<AdminTenantFeatureItem> {
    const feature = this.requireMutableFeature(input.featureKey);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { id: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant nao encontrado.');
    }

    const globalSetting = await this.getGlobalSetting(feature.key);
    const globalStatus = this.resolveEffectiveGlobalStatus(feature, globalSetting);

    if (input.mode === 'enabled' && (globalStatus === 'disabled' || globalStatus === 'internal' || globalStatus === 'coming_soon')) {
      throw new BadRequestException('Nao e permitido ativar esta feature para o tenant no estado global atual.');
    }

    const reason = input.mode === 'inherit' ? null : this.requireReason(input.reason ?? '');

    await this.prisma.$transaction(async (tx) => {
      const previous = await tx.featureTenantOverride.findUnique({
        where: {
          tenantId_featureKey: {
            tenantId: input.tenantId,
            featureKey: feature.key,
          },
        },
      });

      if (input.mode === 'inherit') {
        await tx.featureTenantOverride.deleteMany({
          where: {
            tenantId: input.tenantId,
            featureKey: feature.key,
          },
        });
      } else {
        await tx.featureTenantOverride.upsert({
          where: {
            tenantId_featureKey: {
              tenantId: input.tenantId,
              featureKey: feature.key,
            },
          },
          update: {
            mode: input.mode,
            reason,
            expiresAt: input.expiresAt ?? null,
            updatedBy: input.adminId,
          },
          create: {
            tenantId: input.tenantId,
            featureKey: feature.key,
            mode: input.mode,
            reason,
            expiresAt: input.expiresAt ?? null,
            updatedBy: input.adminId,
          },
        });
      }

      const auditTenantId = await this.platformAuditTenantId(tx);
      await tx.auditLog.create({
        data: {
          tenantId: auditTenantId,
          userId: input.adminId,
          userType: 'admin',
          action: 'feature.tenant_override.update',
          resource: 'feature_control',
          details: {
            tenantId: input.tenantId,
            featureKey: feature.key,
            previousMode: previous ? this.normalizeTenantOverrideMode(previous.mode) : 'inherit',
            nextMode: input.mode,
            previousReason: previous?.reason ?? null,
            nextReason: reason,
            expiresAt: input.expiresAt?.toISOString() ?? null,
          },
          ip: input.ip ?? null,
        },
      });
    });

    const updated = await this.getTenantFeatureCatalog(input.tenantId);
    const row = updated.features.find((item) => item.featureKey === feature.key);
    if (!row) {
      throw new NotFoundException('Feature nao encontrada para o tenant.');
    }
    return row;
  }

  listPresets() {
    return FEATURE_PRESETS.map((preset) => ({
      key: preset.key,
      name: preset.name,
      description: preset.description,
      enabledCount: preset.enabledFeatures.length,
      disabledCount: preset.disabledFeatures.length,
    }));
  }

  async previewPreset(input: PreviewPresetInput): Promise<FeaturePresetPreviewResponse> {
    const preset = this.requirePreset(input.presetKey);
    const tenant = input.scope === 'tenant'
      ? await this.prisma.tenant.findUnique({
        where: { id: input.tenantId },
        select: { id: true, name: true, slug: true },
      })
      : null;

    if (input.scope === 'tenant' && !tenant) {
      throw new NotFoundException('Tenant nao encontrado.');
    }

    const context = input.scope === 'tenant' && input.tenantId
      ? await this.buildContext(input.tenantId)
      : null;

    const changes = FEATURE_CATALOG.map((feature) => this.previewFeaturePresetChange(feature, preset.key, input.scope, context));
    const summary = {
      total: changes.length,
      willEnable: changes.filter((item) => item.action === 'enable').length,
      willDisable: changes.filter((item) => item.action === 'disable').length,
      ignoredEssential: changes.filter((item) => item.action === 'ignored').length,
      blocked: changes.filter((item) => item.action === 'blocked').length,
      unchanged: changes.filter((item) => item.action === 'unchanged' || item.action === 'inherit').length,
    };

    return {
      preset: {
        key: preset.key,
        name: preset.name,
        description: preset.description,
      },
      scope: input.scope,
      tenant: tenant ?? undefined,
      summary,
      changes,
    };
  }

  async applyPresetGlobal(input: ApplyPresetGlobalInput): Promise<FeaturePresetPreviewResponse> {
    if (input.confirmation.trim().toUpperCase() !== 'APLICAR GLOBAL') {
      throw new BadRequestException('Confirmacao invalida para aplicacao global.');
    }

    const reason = this.requireReason(input.reason);
    const preview = await this.previewPreset({ presetKey: input.presetKey, scope: 'global' });

    await this.prisma.$transaction(async (tx) => {
      for (const change of preview.changes) {
        if (change.action !== 'enable' && change.action !== 'disable') {
          continue;
        }

        if (!change.targetStatus) {
          continue;
        }

        await tx.featureGlobalSetting.upsert({
          where: { featureKey: change.featureKey },
          update: {
            status: change.targetStatus,
            reason,
            updatedBy: input.adminId,
          },
          create: {
            featureKey: change.featureKey,
            status: change.targetStatus,
            reason,
            updatedBy: input.adminId,
          },
        });
      }

      const auditTenantId = await this.platformAuditTenantId(tx);
      await tx.auditLog.create({
        data: {
          tenantId: auditTenantId,
          userId: input.adminId,
          userType: 'admin',
          action: 'feature.preset.apply_global',
          resource: 'feature_control',
          details: {
            presetKey: input.presetKey,
            reason,
            changes: preview.changes,
          },
          ip: input.ip ?? null,
        },
      });
    });

    return this.previewPreset({ presetKey: input.presetKey, scope: 'global' });
  }

  async applyPresetTenant(input: ApplyPresetTenantInput): Promise<FeaturePresetPreviewResponse> {
    if (input.confirmation.trim().toUpperCase() !== 'APLICAR TENANT') {
      throw new BadRequestException('Confirmacao invalida para aplicacao por tenant.');
    }

    const reason = this.requireReason(input.reason);
    const preview = await this.previewPreset({ presetKey: input.presetKey, scope: 'tenant', tenantId: input.tenantId });

    await this.prisma.$transaction(async (tx) => {
      for (const change of preview.changes) {
        if (change.action !== 'enable' && change.action !== 'disable' && change.action !== 'inherit') {
          continue;
        }

        if (change.action === 'inherit' || change.targetOverrideMode === 'inherit') {
          await tx.featureTenantOverride.deleteMany({
            where: {
              tenantId: input.tenantId,
              featureKey: change.featureKey,
            },
          });
          continue;
        }

        if (!change.targetOverrideMode) {
          continue;
        }

        await tx.featureTenantOverride.upsert({
          where: {
            tenantId_featureKey: {
              tenantId: input.tenantId,
              featureKey: change.featureKey,
            },
          },
          update: {
            mode: change.targetOverrideMode,
            reason,
            expiresAt: null,
            updatedBy: input.adminId,
          },
          create: {
            tenantId: input.tenantId,
            featureKey: change.featureKey,
            mode: change.targetOverrideMode,
            reason,
            expiresAt: null,
            updatedBy: input.adminId,
          },
        });
      }

      const auditTenantId = await this.platformAuditTenantId(tx);
      await tx.auditLog.create({
        data: {
          tenantId: auditTenantId,
          userId: input.adminId,
          userType: 'admin',
          action: 'feature.preset.apply_tenant',
          resource: 'feature_control',
          details: {
            tenantId: input.tenantId,
            presetKey: input.presetKey,
            reason,
            changes: preview.changes,
          },
          ip: input.ip ?? null,
        },
      });
    });

    return this.previewPreset({ presetKey: input.presetKey, scope: 'tenant', tenantId: input.tenantId });
  }

  private resolveTenantFeatureWithContext(
    input: ResolveTenantFeatureInput,
    context: FeatureResolutionContext,
  ): TenantCapabilityDecision {
    const feature = this.requireFeature(input.featureKey);

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

    const availabilityResult = this.resolveFeatureAvailability(
      feature,
      context.billingState,
      context.entitlements,
      context.moduleAccessMap,
    );
    const tenantOverride = this.resolveEffectiveOverride(feature, context);

    if (feature.requiresExplicitTenantEnablement) {
      if (tenantOverride?.mode === 'disabled') {
        return {
          enabled: false,
          reason: 'tenant_disabled',
          source: tenantOverride.source,
        };
      }

      if (tenantOverride?.mode !== 'enabled') {
        return {
          enabled: false,
          reason: 'tenant_opt_in_required',
          source: 'feature_catalog',
        };
      }

      // An opt-in grants eligibility for this tenant, but it never bypasses
      // the canonical plan/module or RBAC gates below.
      if (!availabilityResult.enabled) {
        return availabilityResult;
      }

      const permissionDecision = input.skipUserPermissionCheck
        ? null
        : this.resolvePermissionDecision(feature, input.requiredPermission, context.permissions);
      if (permissionDecision) {
        return permissionDecision;
      }

      const envDecision = this.resolveEnvFallback(feature);
      if (envDecision) {
        return envDecision;
      }

      return {
        enabled: true,
        reason: 'tenant_enabled_override',
        source: tenantOverride.source,
      };
    }

    const effectiveAvailability = this.applyTenantOverrideToAvailability(availabilityResult, tenantOverride);

    if (!effectiveAvailability.enabled) {
      return effectiveAvailability;
    }

    const permissionDecision = input.skipUserPermissionCheck
      ? null
      : this.resolvePermissionDecision(feature, input.requiredPermission, context.permissions);
    if (permissionDecision) {
      return permissionDecision;
    }

    const envDecision = this.resolveEnvFallback(feature);
    if (envDecision) {
      return envDecision;
    }

    if (effectiveAvailability.reason === 'tenant_enabled_override' || effectiveAvailability.reason === 'tenant_disabled') {
      return effectiveAvailability;
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

  private async buildContext(tenantId: string, userId?: string): Promise<FeatureResolutionContext> {
    const [billingState, moduleAccessRows, entitlements, permissions, globalSettingsMap, tenantOverrideMap] = await Promise.all([
      this.tenantBillingResolver.getTenantBillingState(tenantId),
      this.getTenantModuleAccessRows(tenantId),
      this.billingEntitlementsService.resolveTenantEntitlements(tenantId),
      userId ? this.rbacService.getUserPermissions(userId) : Promise.resolve<string[]>([]),
      this.getGlobalSettingsMap(),
      this.getTenantOverridesMap(tenantId),
    ]);

    return {
      billingState,
      entitlements,
      permissions,
      moduleAccessMap: new Map<string, boolean>(moduleAccessRows.map((row) => [row.module, row.enabled])),
      legacyOverrideMap: new Map<string, LegacyOverrideRow>(
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
      tenantOverrideMap,
    };
  }

  private async getTenantModuleAccessRows(tenantId: string): Promise<TenantModuleAccessRow[]> {
    return this.prisma.$queryRaw<TenantModuleAccessRow[]>`
      SELECT module, enabled
      FROM tenant_module_access
      WHERE tenant_id = ${tenantId}
    `;
  }

  private async getGlobalSettingsMap(): Promise<Map<string, GlobalSettingRow>> {
    const rows = await this.prisma.featureGlobalSetting.findMany();
    return new Map(
      rows.map((row) => [
        row.featureKey,
        {
          featureKey: row.featureKey,
          status: this.normalizeGlobalStatus(row.status),
          reason: row.reason,
          updatedAt: row.updatedAt,
          updatedBy: row.updatedBy,
        } satisfies GlobalSettingRow,
      ]),
    );
  }

  private async getTenantOverridesMap(tenantId: string): Promise<Map<string, TenantOverrideRow>> {
    const rows = await this.prisma.featureTenantOverride.findMany({
      where: { tenantId },
    });
    const now = new Date();
    return new Map(
      rows
        .filter((row) => !row.expiresAt || row.expiresAt > now)
        .map((row) => [
          row.featureKey,
          {
            featureKey: row.featureKey,
            mode: this.normalizeTenantOverrideMode(row.mode),
            reason: row.reason,
            expiresAt: row.expiresAt,
            updatedAt: row.updatedAt,
            updatedBy: row.updatedBy,
          } satisfies TenantOverrideRow,
        ]),
    );
  }

  private async getGlobalSetting(featureKey: string): Promise<GlobalSettingRow | null> {
    const row = await this.prisma.featureGlobalSetting.findUnique({
      where: { featureKey },
    });
    if (!row) {
      return null;
    }
    return {
      featureKey: row.featureKey,
      status: this.normalizeGlobalStatus(row.status),
      reason: row.reason,
      updatedAt: row.updatedAt,
      updatedBy: row.updatedBy,
    };
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

  private resolveEffectiveOverride(
    feature: FeatureCatalogEntry,
    context: FeatureResolutionContext,
  ): EffectiveOverrideRow | null {
    const tenantOverride = context.tenantOverrideMap.get(feature.key);
    if (tenantOverride && tenantOverride.mode !== 'inherit') {
      return {
        mode: tenantOverride.mode,
        reason: tenantOverride.reason,
        source: 'tenant_feature_override',
      };
    }

    if (!feature.billingEntitlementKey) {
      return null;
    }

    const legacyOverride = context.legacyOverrideMap.get(feature.billingEntitlementKey);
    if (!legacyOverride) {
      return null;
    }

    return {
      mode: legacyOverride.enabled ? 'enabled' : 'disabled',
      reason: legacyOverride.reason,
      source: legacyOverride.source,
    };
  }

  private applyTenantOverrideToAvailability(
    availability: TenantCapabilityDecision,
    tenantOverride: EffectiveOverrideRow | null,
  ): TenantCapabilityDecision {
    if (!tenantOverride) {
      return availability;
    }

    if (tenantOverride.mode === 'disabled') {
      return {
        enabled: false,
        reason: 'tenant_disabled',
        source: tenantOverride.source,
      };
    }

    if (!availability.enabled) {
      return {
        enabled: true,
        reason: 'tenant_enabled_override',
        source: tenantOverride.source,
      };
    }

    return {
      enabled: true,
      reason: 'tenant_enabled_override',
      source: tenantOverride.source,
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

  private previewFeaturePresetChange(
    feature: FeatureCatalogEntry,
    presetKey: FeaturePresetKey,
    scope: PresetPreviewScope,
    context: FeatureResolutionContext | null,
  ): PresetChange {
    const preset = this.requirePreset(presetKey);
    const isEnabledTarget = preset.enabledFeatures.includes(feature.key);
    const isDisabledTarget = preset.disabledFeatures.includes(feature.key);

    const globalStatus = this.resolveEffectiveGlobalStatus(feature, context?.globalSettingsMap.get(feature.key) ?? null);
    const tenantOverride = context?.tenantOverrideMap.get(feature.key)?.mode ?? 'inherit';
    const effectiveBefore = context
      ? this.resolveTenantFeatureWithContext({ tenantId: 'preview', featureKey: feature.key }, context).enabled
      : globalStatus !== 'disabled' && globalStatus !== 'internal' && globalStatus !== 'coming_soon';

    if (feature.essential) {
      return {
        featureKey: feature.key,
        name: feature.name,
        targetStatus: null,
        targetOverrideMode: null,
        currentGlobalStatus: globalStatus,
        currentTenantOverride: tenantOverride,
        effectiveEnabledBefore: effectiveBefore,
        effectiveEnabledAfter: effectiveBefore,
        action: 'ignored',
        reason: 'Feature essencial ignorada pelo preset.',
      };
    }

    if (!isEnabledTarget && !isDisabledTarget) {
      return {
        featureKey: feature.key,
        name: feature.name,
        targetStatus: null,
        targetOverrideMode: scope === 'tenant' ? 'inherit' : null,
        currentGlobalStatus: globalStatus,
        currentTenantOverride: tenantOverride,
        effectiveEnabledBefore: effectiveBefore,
        effectiveEnabledAfter: effectiveBefore,
        action: scope === 'tenant' && tenantOverride !== 'inherit' ? 'inherit' : 'unchanged',
        reason: scope === 'tenant' && tenantOverride !== 'inherit'
          ? 'Preset retornaria a feature para heranca global/plano.'
          : 'Preset nao altera esta feature.',
      };
    }

    if (isEnabledTarget && (feature.status === 'coming_soon' || globalStatus === 'coming_soon')) {
      return {
        featureKey: feature.key,
        name: feature.name,
        targetStatus: null,
        targetOverrideMode: null,
        currentGlobalStatus: globalStatus,
        currentTenantOverride: tenantOverride,
        effectiveEnabledBefore: effectiveBefore,
        effectiveEnabledAfter: effectiveBefore,
        action: 'blocked',
        reason: 'Feature em breve nao pode ser ativada pelo preset.',
      };
    }

    if (isEnabledTarget && globalStatus === 'disabled' && scope === 'tenant') {
      return {
        featureKey: feature.key,
        name: feature.name,
        targetStatus: null,
        targetOverrideMode: null,
        currentGlobalStatus: globalStatus,
        currentTenantOverride: tenantOverride,
        effectiveEnabledBefore: effectiveBefore,
        effectiveEnabledAfter: effectiveBefore,
        action: 'blocked',
        reason: 'Feature desativada globalmente nao pode ser reativada no tenant.',
      };
    }

    if (scope === 'global') {
      const targetStatus = isEnabledTarget ? this.resolvePresetEnabledStatus(feature) : 'disabled';
      if (!targetStatus) {
        return {
          featureKey: feature.key,
          name: feature.name,
          targetStatus: null,
          targetOverrideMode: null,
          currentGlobalStatus: globalStatus,
          currentTenantOverride: tenantOverride,
          effectiveEnabledBefore: effectiveBefore,
          effectiveEnabledAfter: effectiveBefore,
          action: 'blocked',
          reason: 'Feature nao pode receber status global habilitado por este preset.',
        };
      }

      const effectiveAfter = targetStatus !== 'disabled' && targetStatus !== 'internal' && targetStatus !== 'coming_soon';
      return {
        featureKey: feature.key,
        name: feature.name,
        targetStatus,
        targetOverrideMode: null,
        currentGlobalStatus: globalStatus,
        currentTenantOverride: tenantOverride,
        effectiveEnabledBefore: effectiveBefore,
        effectiveEnabledAfter: effectiveAfter,
        action: targetStatus === globalStatus ? 'unchanged' : isEnabledTarget ? 'enable' : 'disable',
        reason: targetStatus === globalStatus
          ? 'Status global ja corresponde ao preset.'
          : isEnabledTarget
            ? 'Preset ajustaria o status global da feature.'
            : 'Preset desativaria a feature globalmente.',
      };
    }

    const targetOverrideMode: FeatureTenantOverrideMode = isEnabledTarget ? 'enabled' : 'disabled';
    const effectiveAfter = isEnabledTarget;
    return {
      featureKey: feature.key,
      name: feature.name,
      targetStatus: null,
      targetOverrideMode,
      currentGlobalStatus: globalStatus,
      currentTenantOverride: tenantOverride,
      effectiveEnabledBefore: effectiveBefore,
      effectiveEnabledAfter: effectiveAfter,
      action: targetOverrideMode === tenantOverride ? 'unchanged' : isEnabledTarget ? 'enable' : 'disable',
      reason: targetOverrideMode === tenantOverride
        ? 'Override do tenant ja corresponde ao preset.'
        : isEnabledTarget
          ? 'Preset criaria override de ativacao para o tenant.'
          : 'Preset criaria override de desativacao para o tenant.',
    };
  }

  private resolvePresetEnabledStatus(feature: FeatureCatalogEntry): FeatureOperationalStatus | null {
    if (feature.status === 'coming_soon' || feature.status === 'legacy') {
      return null;
    }
    return featureStatusToOperationalStatus(feature.status);
  }

  private resolveEffectiveGlobalStatus(feature: FeatureCatalogEntry, globalSetting: GlobalSettingRow | null): FeatureOperationalStatus {
    if (globalSetting) {
      return globalSetting.status;
    }
    return featureStatusToOperationalStatus(feature.status);
  }

  private normalizeGlobalStatus(status: string): FeatureOperationalStatus {
    if (status === 'enabled' || status === 'disabled' || status === 'beta' || status === 'internal' || status === 'coming_soon') {
      return status;
    }
    return 'disabled';
  }

  private normalizeTenantOverrideMode(mode: string): FeatureTenantOverrideMode {
    if (mode === 'inherit' || mode === 'enabled' || mode === 'disabled') {
      return mode;
    }
    return 'inherit';
  }

  private normalizePermissions(permission: string | string[] | undefined): string[] | undefined {
    if (!permission) {
      return undefined;
    }
    return Array.isArray(permission) ? permission : [permission];
  }

  private readBillingEntitlementFlag(flags: Record<BillingEntitlementFlagKey, boolean>, flagKey: BillingEntitlementFlagKey): boolean {
    return Boolean(flags[flagKey]);
  }

  private requireFeature(featureKey: string): FeatureCatalogEntry {
    const feature = FEATURE_CATALOG_BY_KEY[featureKey as CatalogFeatureKey];
    if (!feature) {
      throw new BadRequestException('featureKey invalida.');
    }
    return feature;
  }

  private requireMutableFeature(featureKey: string): FeatureCatalogEntry {
    const feature = this.requireFeature(featureKey);
    if (feature.essential || !feature.canDisable) {
      throw new BadRequestException('Feature essencial nao pode ser alterada.');
    }
    return feature;
  }

  private requirePreset(presetKey: FeaturePresetKey) {
    const preset = FEATURE_PRESET_BY_KEY[presetKey];
    if (!preset) {
      throw new BadRequestException('presetKey invalido.');
    }
    return preset;
  }

  private requireReason(reason: string): string {
    const normalized = reason.trim();
    if (!normalized) {
      throw new BadRequestException('reason e obrigatorio.');
    }
    return normalized;
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
