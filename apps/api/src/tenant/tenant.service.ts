import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantStatus } from '@gestor/core';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';

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
}
