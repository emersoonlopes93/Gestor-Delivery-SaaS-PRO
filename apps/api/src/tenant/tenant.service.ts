import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantStatus } from '@gestor/core';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import type { TenantOperatingHours } from '@gestor/types';
import { Prisma } from '@prisma/client';
import { 
  getDefaultStorefrontThemeSettings, 
  getDefaultStorefrontLayoutSettings,
  sanitizeHexColor
} from '@gestor/theme';

@Injectable()
export class TenantService {
  private readonly logger = new Logger('TenantService');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find a tenant by ID.
   */
  async findById(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { settings: true, operatingHours: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
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

    return this.prisma.tenantSettings.upsert({
      where: { tenantId },
      create: {
        ...dto,
        tenantId,
        notificationTemplates: dto.notificationTemplates as Prisma.InputJsonValue,
      } as Prisma.TenantSettingsUncheckedCreateInput,
      update: data,
    });
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
      theme: {
        ...getDefaultStorefrontThemeSettings(),
        ...(settings?.storefrontThemeJson as any || {}),
      },
      layout: {
        ...getDefaultStorefrontLayoutSettings(),
        ...(settings?.storefrontLayoutJson as any || {}),
      },
    };
  }

  /**
   * Update storefront customization.
   */
  async updateStorefrontCustomization(tenantId: string, data: any) {
    const updateData: Prisma.TenantSettingsUpdateInput = {};

    if (data.theme) {
      // Basic sanitization
      if (data.theme.primaryColor) {
        data.theme.primaryColor = sanitizeHexColor(data.theme.primaryColor);
      }
      updateData.storefrontThemeJson = data.theme;
    }

    if (data.layout) {
      updateData.storefrontLayoutJson = data.layout;
    }

    return this.prisma.tenantSettings.update({
      where: { tenantId },
      data: updateData,
    });
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

