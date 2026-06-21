import { Injectable, NotFoundException, BadRequestException, Logger, Inject, ForbiddenException, ConflictException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../database/prisma.service';
import { TenantDefaultRole, TenantStatus } from '@gestor/core';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import type { BusinessGroupRole, CreateBranchRequest, TenantNetworkContext, TenantOperatingHours } from '@gestor/types';
import { Prisma } from '@prisma/client';
import { 
  getStorefrontPresetById,
  normalizeStorefrontTheme,
  normalizeStorefrontLayout
} from '@gestor/theme';
import { StorefrontCustomizationPayload } from '@gestor/types';

@Injectable()
export class TenantService {
  private readonly logger = new Logger('TenantService');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

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

  private async findOwnerUser(tenantId: string) {
    return this.prisma.tenantUser.findFirst({
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

    return tenant;
  }

  async getNetworkContext(tenantId: string) {
    return this.buildNetworkContextInternal(tenantId);
  }

  async createBranch(tenantId: string, currentUserId: string, dto: CreateBranchRequest) {
    const currentUser = await this.prisma.tenantUser.findFirst({
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
      select: {
        id: true,
      },
    });

    if (!currentUser) {
      throw new ForbiddenException('Apenas a conta dona da matriz pode criar filiais');
    }

    const currentTenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
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

    const ownerUser = await this.findOwnerUser(tenantId);
    if (!ownerUser) {
      throw new BadRequestException('A loja precisa ter um dono ativo para criar filiais');
    }

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

    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug: sanitizedSlugBase },
      select: { id: true },
    });

    if (existingTenant) {
      throw new ConflictException('Já existe uma loja com este slug');
    }

    await this.prisma.$transaction(async (tx) => {
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
          settings: {
            create: {},
          },
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
          email: ownerUser.email.toLowerCase(),
          name: ownerUser.name,
          passwordHash: ownerUser.passwordHash,
          isActive: true,
        },
      });

      let ownerRole = await tx.tenantRole.findFirst({
        where: {
          tenantId: createdTenant.id,
          slug: TenantDefaultRole.TENANT_OWNER,
        },
      });

      if (!ownerRole) {
        ownerRole = await tx.tenantRole.create({
          data: {
            tenantId: createdTenant.id,
            name: 'Dono',
            slug: TenantDefaultRole.TENANT_OWNER,
            isSystem: true,
          },
        });

        const allPermissions = await tx.tenantPermission.findMany({
          select: { id: true },
        });

        if (allPermissions.length > 0) {
          await tx.tenantRolePermission.createMany({
            data: allPermissions.map((permission) => ({
              roleId: ownerRole.id,
              permissionId: permission.id,
            })),
          });
        }
      }

      await tx.tenantUserRole.create({
        data: {
          userId: createdUser.id,
          roleId: ownerRole.id,
        },
      });
    });

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
    return tenant;
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

    return updated;
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
      if (themeSettings.backgroundImageMediaId) {
        const asset = await this.prisma.mediaAsset.findFirst({
          where: {
            id: themeSettings.backgroundImageMediaId,
            tenantId,
          },
        });
        if (!asset) {
          throw new BadRequestException('A imagem de fundo informada é inválida ou pertence a outro inquilino.');
        }
        // Force matching URL to prevent hijack
        themeSettings.backgroundImageUrl = asset.publicUrl;
      }
      updateData.storefrontThemeJson = themeSettings as Prisma.InputJsonValue;
    }

    if (data.layout) {
      updateData.storefrontLayoutJson = normalizeStorefrontLayout(data.layout) as Prisma.InputJsonValue;
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

