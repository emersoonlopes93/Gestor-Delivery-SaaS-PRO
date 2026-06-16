import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

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

  /**
   * Add a tenant to a business group.
   */
  async addTenantToGroup(groupId: string, tenantId: string) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { businessGroupId: groupId },
    });
  }

  /**
   * Remove a tenant from a business group.
   */
  async removeTenantFromGroup(tenantId: string) {
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: { businessGroupId: null },
    });
  }
}
