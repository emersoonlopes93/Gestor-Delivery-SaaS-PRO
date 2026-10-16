import { Injectable, NotFoundException, BadRequestException, Logger, Inject, ForbiddenException, ConflictException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../database/prisma.service';
import { TenantDefaultRole, TenantStatus } from '@gestor/core';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import type { BusinessGroupRole, CreateBranchRequest, PlatformBrandingDTO, TenantNetworkContext, TenantOperatingHours } from '@gestor/types';
import { Prisma } from '@prisma/client';
import { 
  getStorefrontPresetById,
  normalizeStorefrontTheme,
  normalizeStorefrontLayout
} from '@gestor/theme';
import { StorefrontCustomizationPayload } from '@gestor/types';
import { ensureDefaultTenantRoles } from './default-tenant-roles';
import { runSerializableTransactionWithRetry } from '../database/serializable-transaction';
import { omitTenantFinancialSecrets } from '../payment-foundation/payment-secret-redaction';

type TenantUserLookupClient = Pick<Prisma.TransactionClient, 'tenantUser'>;

function prismaUniqueConstraintTargets(error: unknown): string[] {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return [];
  }

  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.filter((item): item is string => typeof item === 'string');
  }
  return typeof target === 'string' ? [target] : [];
}

function isBranchSlugConflict(error: unknown): boolean {
  return prismaUniqueConstraintTargets(error).some((target) => target.toLowerCase().includes('slug'));
}

function isTenantUserIdentityConflict(error: unknown): boolean {
  const targets = prismaUniqueConstraintTargets(error).map((target) => target.toLowerCase());
  return targets.some((target) => target.includes('tenant_id') || target.includes('tenantid'))
    && targets.some((target) => target.includes('email'));
}

@Injectable()
export class TenantService {
  private readonly logger = new Logger('TenantService');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async getPlatformBranding(): Promise<PlatformBrandingDTO> {
    const config = await this.prisma.systemConfig.findUnique({
      where: { id: 'global' },
      select: {
        appName: true,
        platformLogoMedia: {
          select: {
            publicUrl: true,
          },
        },
      },
    });

    return {
      systemName: config?.appName ?? 'PedeHub',
      logoUrl: config?.platformLogoMedia?.publicUrl ?? null,
    };
  }

  private async invalidateStorefrontCacheByTenantId(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    });
    if (!tenant?.slug) return;

    await Promise.all([
      this.cacheManager.del(`storefront:${tenant.slug}:delivery`),
      this.cacheManager.del(`storefront:${tenant.slug}:pickup`),
    ]);
  }

  private async findOwnerUser(tenantId: string, client: TenantUserLookupClient = this.prisma) {
    return client.tenantUser.findFirst({
      where: {
        tenantId,
        isActive: true,
        userRoles: {
          some: {
            role: {
              slug: TenantDefaultRole.TENANT_OWNER,
            },
          },
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async buildNetworkContextInternal(tenantId: string): Promise<TenantNetworkContext> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        businessGroupId: true,
        businessGroupRole: true,
        settings: {
          select: {
            city: true,
            state: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const ownerUser = await this.findOwnerUser(tenantId);
    if (!ownerUser) {
      throw new BadRequestException('A loja precisa ter um dono ativo configurado para usar rede de lojas');
    }

    const stores = tenant.businessGroupId
      ? await this.prisma.tenant.findMany({
          where: {
            businessGroupId: tenant.businessGroupId,
            users: {
              some: {
                email: ownerUser.email.toLowerCase(),
                isActive: true,
                userRoles: {
                  some: {
                    role: {
                      slug: TenantDefaultRole.TENANT_OWNER,
                    },
                  },
                },
              },
            },
          },
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            businessGroupRole: true,
            settings: {
              select: {
                city: true,
                state: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        })
      : [
          {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            status: TenantStatus.ACTIVE,
            businessGroupRole: 'headquarters' as const,
            settings: {
              city: tenant.settings?.city ?? null,
              state: tenant.settings?.state ?? null,
            },
          },
        ];

    const group = tenant.businessGroupId
      ? await this.prisma.businessGroup.findUnique({
          where: { id: tenant.businessGroupId },
          select: { id: true, name: true, headquartersTenantId: true },
        })
      : null;

    const resolvedHeadquartersTenantId =
      group?.headquartersTenantId ??
      stores.find((store) => store.businessGroupRole === 'headquarters')?.id ??
      tenant.id;
    const resolvedRole: BusinessGroupRole =
      tenant.businessGroupRole === 'branch' ? 'branch' : 'headquarters';

    return {
      groupId: group?.id ?? null,
      groupName: group?.name ?? `${tenant.name} Rede`,
      role: resolvedRole,
      ownerEmail: ownerUser.email,
      currentTenantId: tenant.id,
      stores: stores.map((store) => ({
        id: store.id,
        name: store.name,
        slug: store.slug,
        status: store.status,
        isHeadquarters:
          store.businessGroupRole === 'headquarters' || store.id === resolvedHeadquartersTenantId,
        city: store.settings?.city ?? null,
        state: store.settings?.state ?? null,
      })),
    };
  }

  /**
   * Find a tenant by ID.
   */
  async findById(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        settings: true,
        operatingHours: true,
        businessGroup: {
          include: {
            _count: {
              select: { tenants: true },
            },
            tenants: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
                businessGroupRole: true,
              },
              orderBy: {
                name: 'asc',
              },
            },
          },
        },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    if (tenant.businessGroup) {
      const ownerUser = await this.prisma.tenantUser.findFirst({
        where: {
          tenantId,
          isActive: true,
          userRoles: {
            some: {
              role: {
                slug: TenantDefaultRole.TENANT_OWNER,
              },
            },
          },
        },
        select: { email: true },
        orderBy: { createdAt: 'asc' },
      });

      if (ownerUser) {
        const relatedTenants = await this.prisma.tenant.findMany({
          where: {
            businessGroupId: tenant.businessGroup.id,
            users: {
              some: {
                email: ownerUser.email.toLowerCase(),
                isActive: true,
                userRoles: {
                  some: {
                    role: {
                      slug: TenantDefaultRole.TENANT_OWNER,
                    },
                  },
                },
              },
            },
          },
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            businessGroupRole: true,
          },
          orderBy: { name: 'asc' },
        });

        tenant.businessGroup.tenants = relatedTenants;
        tenant.businessGroup._count = {
          tenants: relatedTenants.length,
        };
      }
    }

    return {
      ...tenant,
      settings: tenant.settings ? omitTenantFinancialSecrets(tenant.settings) : null,
    };
  }

  async getNetworkContext(tenantId: string) {
    return this.buildNetworkContextInternal(tenantId);
  }

  async createBranch(tenantId: string, currentUserId: string, dto: CreateBranchRequest) {
    const sanitizedName = dto.name.trim();
    if (!sanitizedName) {
      throw new BadRequestException('Nome da filial é obrigatório');
    }

    const sanitizedSlugBase = (dto.slug?.trim() || sanitizedName)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    if (!sanitizedSlugBase) {
      throw new BadRequestException('Slug inválido para a filial');
    }

    try {
      await runSerializableTransactionWithRetry(
        this.prisma,
        async (tx) => {
          const currentUser = await tx.tenantUser.findFirst({
            where: {
              id: currentUserId,
              tenantId,
              isActive: true,
              userRoles: {
                some: {
                  role: {
                    slug: TenantDefaultRole.TENANT_OWNER,
                  },
                },
              },
            },
            select: { id: true },
          });

          if (!currentUser) {
            throw new ForbiddenException('Apenas a conta dona da matriz pode criar filiais');
          }

          const currentTenant = await tx.tenant.findUnique({
            where: { id: tenantId },
            select: {
              id: true,
              name: true,
              status: true,
              businessGroupId: true,
              businessGroupRole: true,
            },
          });

          if (!currentTenant) {
            throw new NotFoundException('Tenant not found');
          }
          if (currentTenant.businessGroupId && currentTenant.businessGroupRole === 'branch') {
            throw new ForbiddenException('Somente a matriz pode criar novas filiais');
          }

          const ownerUser = await this.findOwnerUser(tenantId, tx);
          if (!ownerUser) {
            throw new BadRequestException('A loja precisa ter um dono ativo para criar filiais');
          }
          const normalizedOwnerEmail = ownerUser.email.trim().toLowerCase();

          let businessGroupId = currentTenant.businessGroupId;
          if (!businessGroupId) {
            const createdGroup = await tx.businessGroup.create({
              data: {
                name: `${currentTenant.name} Rede`,
                ownerId: ownerUser.id,
                headquartersTenantId: tenantId,
              },
            });
            businessGroupId = createdGroup.id;

            await tx.tenant.update({
              where: { id: tenantId },
              data: {
                businessGroupId,
                businessGroupRole: 'headquarters',
              },
            });
          }

          const existingTenant = await tx.tenant.findUnique({
            where: { slug: sanitizedSlugBase },
            select: {
              id: true,
              name: true,
              businessGroupId: true,
              businessGroupRole: true,
              users: {
                where: {
                  email: normalizedOwnerEmail,
                  isActive: true,
                },
                select: {
                  userRoles: {
                    where: { role: { slug: TenantDefaultRole.TENANT_OWNER } },
                    select: { id: true },
                  },
                },
              },
            },
          });

          if (existingTenant) {
            const isSameCompletedAttempt =
              existingTenant.name === sanitizedName
              && existingTenant.businessGroupId === businessGroupId
              && existingTenant.businessGroupRole === 'branch'
              && existingTenant.users.some((user) => user.userRoles.length > 0);

            if (isSameCompletedAttempt) {
              return;
            }

            throw new ConflictException({
              code: 'BRANCH_SLUG_CONFLICT',
              message: 'Já existe uma loja incompatível com este slug.',
            });
          }

          const createdTenant = await tx.tenant.create({
            data: {
              name: sanitizedName,
              slug: sanitizedSlugBase,
              status: currentTenant.status,
              businessGroupId,
              businessGroupRole: 'branch',
              onboarding: {
                create: {
                  stepBasicInfo: false,
                  stepOperatingHours: false,
                  stepLogo: false,
                  stepAddress: false,
                  stepDelivery: false,
                  stepPayments: false,
                  stepWhatsapp: false,
                  stepMenu: false,
                  stepCatalog: false,
                  stepFirstOrder: false,
                },
              },
              settings: { create: {} },
              aiAgentConfig: {
                create: {
                  isEnabled: false,
                  useGlobalDefaults: true,
                  humanInterventionEnabled: true,
                  humanInterventionMinutes: 15,
                  resumeAutomatically: true,
                },
              },
              schedulingSettings: {
                create: {
                  enabled: false,
                  maximumAdvanceDays: 7,
                  timezone: 'America/Sao_Paulo',
                },
              },
            },
          });

          const createdUser = await tx.tenantUser.create({
            data: {
              tenantId: createdTenant.id,
              email: normalizedOwnerEmail,
              name: ownerUser.name,
              passwordHash: ownerUser.passwordHash,
              isActive: true,
            },
          });

          await ensureDefaultTenantRoles(tx, createdTenant.id);
          const ownerRole = await tx.tenantRole.findFirstOrThrow({
            where: {
              tenantId: createdTenant.id,
              slug: TenantDefaultRole.TENANT_OWNER,
            },
          });

          await tx.tenantUserRole.create({
            data: {
              userId: createdUser.id,
              roleId: ownerRole.id,
            },
          });
        },
        {
          isAdditionalRetryableError: isBranchSlugConflict,
          onRetry: (attempt) => this.logger.warn(`Retrying branch creation after a database conflict (attempt ${attempt})`),
        },
      );
    } catch (error) {
      if (isTenantUserIdentityConflict(error)) {
        throw new ConflictException({
          code: 'BRANCH_OWNER_LINK_CONFLICT',
          message: 'A conta dona já possui um vínculo incompatível com a filial solicitada.',
        });
      }
      if (isBranchSlugConflict(error)) {
        throw new ConflictException({
          code: 'BRANCH_SLUG_CONFLICT',
          message: 'Já existe uma loja incompatível com este slug.',
        });
      }
      throw error;
    }

    return this.buildNetworkContextInternal(tenantId);
  }

  /**
   * Find a tenant by slug.
   */
  async findBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      include: { settings: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return {
      ...tenant,
      settings: tenant.settings ? omitTenantFinancialSecrets(tenant.settings) : null,
    };
  }

  /**
   * Validate that a tenant exists and is active.
   */
  async validateTenant(tenantId: string): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    return !!tenant && (
      (tenant.status as string) === (TenantStatus.ACTIVE as string) || 
      (tenant.status as string) === (TenantStatus.TRIAL as string)
    );
  }

  /**
   * Get tenant context for a given tenant ID.
   * Used by middleware/guards to populate request context.
   */
  async getTenantContext(tenantId: string) {
    const tenant = await this.findById(tenantId);
    return {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      tenantStatus: (tenant.status as string).toLowerCase(),
    };
  }

  /**
   * Update tenant basic info.
   */
  async update(tenantId: string, data: { name?: string }) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data,
    });
  }

  /**
   * Update tenant settings.
   */
  async updateSettings(tenantId: string, dto: UpdateTenantSettingsDto) {
    const data: Prisma.TenantSettingsUpdateInput = {
      ...dto,
      notificationTemplates: dto.notificationTemplates as Prisma.InputJsonValue,
    };

    const updated = await this.prisma.tenantSettings.upsert({
      where: { tenantId },
      create: {
        ...dto,
        tenantId,
        notificationTemplates: dto.notificationTemplates as Prisma.InputJsonValue,
      } as Prisma.TenantSettingsUncheckedCreateInput,
      update: data,
    });

    await this.invalidateStorefrontCacheByTenantId(tenantId);

    return omitTenantFinancialSecrets(updated);
  }

  /**
   * Get operating hours for a tenant.
   */
  async getOperatingHours(tenantId: string) {
    return this.prisma.tenantOperatingHours.findMany({
      where: { tenantId },
      orderBy: { dayOfWeek: 'asc' },
    });
  }

  /**
   * Update operating hours in batch.
   */
  async updateOperatingHours(tenantId: string, hours: Omit<TenantOperatingHours, 'id' | 'tenantId'>[]) {
    // Basic validation: openTime < closeTime
    for (const h of hours) {
      if (h.isOpen && h.openTime && h.closeTime) {
        if (h.openTime >= h.closeTime) {
          throw new BadRequestException(`Erro no dia ${h.dayOfWeek}: Horário de abertura deve ser menor que o fechamento.`);
        }
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // Delete existing
      await tx.tenantOperatingHours.deleteMany({
        where: { tenantId },
      });

      // Create new
      return tx.tenantOperatingHours.createMany({
        data: hours.map((h) => ({
          dayOfWeek: h.dayOfWeek,
          isOpen: h.isOpen,
          openTime: h.openTime,
          closeTime: h.closeTime,
          tenantId,
        })),
      });
    });
  }

  /**
   * Get storefront customization for a tenant.
   */
  async getStorefrontCustomization(tenantId: string) {
    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { storefrontThemeJson: true, storefrontLayoutJson: true },
    });

    return {
      theme: normalizeStorefrontTheme(settings?.storefrontThemeJson),
      layout: normalizeStorefrontLayout(settings?.storefrontLayoutJson),
    };
  }

  /**
   * Update storefront customization.
   */
  async updateStorefrontCustomization(tenantId: string, data: Partial<StorefrontCustomizationPayload> & { presetId?: string }) {
    const updateData: Prisma.TenantSettingsUpdateInput = {};

    // 1. Handle Preset (Atomically)
    if (data.presetId) {
      const preset = getStorefrontPresetById(data.presetId);
      if (preset) {
        // Presets are already normalized by definition in theme package
        updateData.storefrontThemeJson = preset.theme as Prisma.InputJsonValue;
        updateData.storefrontLayoutJson = preset.layout as Prisma.InputJsonValue;
        
        const updated = await this.prisma.tenantSettings.update({
          where: { tenantId },
          data: updateData,
          include: { tenant: { select: { slug: true } } }
        });

        // Invalidate public storefront cache for this tenant
        const slug = updated.tenant.slug;
        const cacheKeys = [
          `storefront:${slug}:delivery`,
          `storefront:${slug}:pickup`
        ];
        
        for (const key of cacheKeys) {
          await this.cacheManager.del(key);
        }

        return {
          theme: normalizeStorefrontTheme(updated.storefrontThemeJson),
          layout: normalizeStorefrontLayout(updated.storefrontLayoutJson),
        };
      }
    }

    // 2. Handle Manual Settings with Full Normalization (Hardening)
    if (data.theme) {
      const themeSettings = normalizeStorefrontTheme(data.theme);
      if (themeSettings.backgroundImageMediaId || themeSettings.heroImageMediaId) {
        const assetIds = [
          themeSettings.backgroundImageMediaId,
          themeSettings.heroImageMediaId,
        ].filter((value): value is string => typeof value === 'string' && value.length > 0);

        const assets = assetIds.length > 0
          ? await this.prisma.mediaAsset.findMany({
              where: {
                id: { in: assetIds },
                tenantId,
              },
            })
          : [];
        const assetMap = new Map(assets.map((asset) => [asset.id, asset]));

        if (themeSettings.backgroundImageMediaId) {
          const bgAsset = assetMap.get(themeSettings.backgroundImageMediaId);
          if (!bgAsset) {
            throw new BadRequestException('A imagem de fundo informada é inválida ou pertence a outro inquilino.');
          }
          themeSettings.backgroundImageUrl = bgAsset.publicUrl;
        }

        if (themeSettings.heroImageMediaId) {
          const heroAsset = assetMap.get(themeSettings.heroImageMediaId);
          if (!heroAsset) {
            throw new BadRequestException('O banner informado é inválido ou pertence a outro inquilino.');
          }
          themeSettings.heroImageUrl = heroAsset.publicUrl;
        }
      }
      updateData.storefrontThemeJson = themeSettings as Prisma.InputJsonValue;
    }

    if (data.layout) {
      const layoutSettings = normalizeStorefrontLayout(data.layout);
      const configuredProductIds = layoutSettings.showcase.manualProductIds;

      if (configuredProductIds.length > 0) {
        const tenantProducts = await this.prisma.product.findMany({
          where: {
            tenantId,
            id: { in: configuredProductIds },
          },
          select: { id: true },
        });

        if (tenantProducts.length !== configuredProductIds.length) {
          throw new BadRequestException('Um ou mais produtos da vitrine são inválidos para esta loja.');
        }
      }

      updateData.storefrontLayoutJson = layoutSettings as Prisma.InputJsonValue;
    }

    if (!updateData.storefrontThemeJson && !updateData.storefrontLayoutJson) {
      return { success: true, message: 'No changes applied' };
    }

    const updated = await this.prisma.tenantSettings.update({
      where: { tenantId },
      data: updateData,
      include: { tenant: { select: { slug: true } } }
    });

    // Invalidate public storefront cache for this tenant
    const slug = updated.tenant.slug;
    const cacheKeys = [
      `storefront:${slug}:delivery`,
      `storefront:${slug}:pickup`
    ];
    
    for (const key of cacheKeys) {
      await this.cacheManager.del(key);
    }

    return {
      theme: normalizeStorefrontTheme(updated.storefrontThemeJson),
      layout: normalizeStorefrontLayout(updated.storefrontLayoutJson),
    };
  }

  /**
   * Toggle or update store pause status.
   */
  async updateStorePause(tenantId: string, isStorePaused: boolean, storePauseReason?: string) {
    return this.prisma.tenantSettings.update({
      where: { tenantId },
      data: {
        isStorePaused,
        storePauseReason,
      },
    });
  }
}

