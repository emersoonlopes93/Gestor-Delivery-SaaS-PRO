import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantStatus } from '@gestor/core';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import type { TenantOperatingHours } from '@gestor/types';

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
      include: { settings: true },
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
    return this.prisma.tenantSettings.upsert({
      where: { tenantId },
      create: {
        ...dto,
        tenantId,
      },
      update: dto,
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

