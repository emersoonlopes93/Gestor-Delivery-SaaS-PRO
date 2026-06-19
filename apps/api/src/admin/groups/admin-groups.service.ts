import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TenantDefaultRole } from '@gestor/core';

@Injectable()
export class AdminGroupsService {
  private readonly logger = new Logger('AdminGroupsService');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all business groups.
   */
  async findAll() {
    return this.prisma.businessGroup.findMany({
      include: {
        _count: {
          select: { tenants: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get aggregated metrics for a business group.
   */
  async getGroupMetrics(groupId: string) {
    const tenants = await this.prisma.tenant.findMany({
      where: { businessGroupId: groupId },
      select: { id: true },
    });

    const tenantIds = tenants.map((t) => t.id);

    if (tenantIds.length === 0) {
      return { totalSales: 0, totalOrders: 0 };
    }

    const [salesAggregate, ordersCount] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          tenantId: { in: tenantIds },
          status: 'completed',
        },
        _sum: { total: true },
      }),
      this.prisma.order.count({
        where: {
          tenantId: { in: tenantIds },
          status: 'completed',
        },
      }),
    ]);

    return {
      totalSales: Number(salesAggregate._sum.total || 0),
      totalOrders: ordersCount,
    };
  }

  /**
   * Create a new business group.
   */
  async create(data: { name: string; ownerId?: string }) {
    return this.prisma.businessGroup.create({
      data,
    });
  }

  private async findTenantOwner(tenantId: string) {
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
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  private async resolveGroupOwnerEmail(groupId: string): Promise<string | null> {
    const group = await this.prisma.businessGroup.findUnique({
      where: { id: groupId },
      select: { headquartersTenantId: true },
    });

    if (!group?.headquartersTenantId) {
      return null;
    }

    const owner = await this.findTenantOwner(group.headquartersTenantId);
    return owner?.email.toLowerCase() ?? null;
  }

  /**
   * Add a tenant to a business group.
   */
  async addTenantToGroup(groupId: string, tenantId: string) {
    const [group, tenant, tenantOwner, groupOwnerEmail] = await Promise.all([
      this.prisma.businessGroup.findUnique({
        where: { id: groupId },
        select: { id: true, ownerId: true, headquartersTenantId: true },
      }),
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true, businessGroupId: true },
      }),
      this.findTenantOwner(tenantId),
      this.resolveGroupOwnerEmail(groupId),
    ]);

    if (!group) {
      throw new NotFoundException('Grupo de negócios não encontrado');
    }

    if (!tenant) {
      throw new NotFoundException('Loja não encontrada');
    }

    if (!tenantOwner) {
      throw new BadRequestException('A loja precisa ter um usuário dono ativo antes de entrar em uma rede');
    }

    if (tenant.businessGroupId && tenant.businessGroupId !== groupId) {
      throw new ConflictException('A loja já está vinculada a outra rede. Remova o vínculo atual antes de continuar.');
    }

    const normalizedTenantOwnerEmail = tenantOwner.email.toLowerCase();
    if (groupOwnerEmail && groupOwnerEmail !== normalizedTenantOwnerEmail) {
      throw new ConflictException('Esta rede aceita apenas lojas do mesmo dono. O e-mail do dono da loja é diferente do dono da rede.');
    }

    return this.prisma.$transaction(async (tx) => {
      if (!group.ownerId) {
        await tx.businessGroup.update({
          where: { id: groupId },
          data: { ownerId: tenantOwner.id },
        });
      }

      const tenantRole = group.headquartersTenantId ? 'branch' : 'headquarters';

      if (!group.headquartersTenantId) {
        await tx.businessGroup.update({
          where: { id: groupId },
          data: { headquartersTenantId: tenantId },
        });
      }

      return tx.tenant.update({
        where: { id: tenantId },
        data: {
          businessGroupId: groupId,
          businessGroupRole: tenantRole,
        },
      });
    });
  }

  /**
   * Remove a tenant from a business group.
   */
  async removeTenantFromGroup(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        businessGroupId: true,
        businessGroupRole: true,
      },
    });

    if (!tenant?.businessGroupId) {
      throw new NotFoundException('Loja nao vinculada a nenhuma rede');
    }

    const replacementTenant =
      tenant.businessGroupRole === 'headquarters'
        ? await this.prisma.tenant.findFirst({
            where: {
              businessGroupId: tenant.businessGroupId,
              id: { not: tenantId },
            },
            select: { id: true },
            orderBy: { createdAt: 'asc' },
          })
        : null;

    return this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          businessGroupId: null,
          businessGroupRole: null,
        },
      });

      if (tenant.businessGroupRole !== 'headquarters') {
        return { success: true };
      }

      await tx.businessGroup.update({
        where: { id: tenant.businessGroupId! },
        data: { headquartersTenantId: replacementTenant?.id ?? null },
      });

      if (replacementTenant) {
        await tx.tenant.update({
          where: { id: replacementTenant.id },
          data: { businessGroupRole: 'headquarters' },
        });
      }

      return { success: true };
    });
  }
}
