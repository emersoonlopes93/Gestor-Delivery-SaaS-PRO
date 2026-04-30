import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AdminFranchiseService {
  private readonly logger = new Logger(AdminFranchiseService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtém dashboard consolidado de um grupo de negócios (franquia)
   */
  async getConsolidatedDashboard(businessGroupId: string, startDate: Date, endDate: Date) {
    // 1. Obter todos os tenants do grupo
    const tenants = await this.prisma.tenant.findMany({
      where: { businessGroupId },
      select: { id: true, name: true, slug: true },
    });

    const tenantIds = tenants.map((t) => t.id);

    // 2. Agregar vendas por tenant
    const salesData = await this.prisma.order.groupBy({
      by: ['tenantId'],
      where: {
        tenantId: { in: tenantIds },
        createdAt: { gte: startDate, lte: endDate },
        status: 'completed',
      },
      _sum: {
        total: true,
      },
      _count: {
        id: true,
      },
    });

    // 3. Agregar top produtos da rede
    const topProducts = await this.prisma.orderItem.groupBy({
      by: ['snapshotName'],
      where: {
        tenantId: { in: tenantIds },
        createdAt: { gte: startDate, lte: endDate },
      },
      _sum: {
        quantity: true,
        lineTotal: true,
      },
      orderBy: {
        _sum: {
          quantity: 'desc',
        },
      },
      take: 10,
    });

    // 4. Formatar resposta
    const consolidated = {
      totalSales: salesData.reduce((acc, curr) => acc + Number(curr._sum.total || 0), 0),
      totalOrders: salesData.reduce((acc, curr) => acc + curr._count.id, 0),
      tenants: tenants.map((t) => {
        const stats = salesData.find((s) => s.tenantId === t.id);
        return {
          id: t.id,
          name: t.name,
          slug: t.slug,
          totalSales: Number(stats?._sum.total || 0),
          totalOrders: stats?._count.id || 0,
        };
      }),
      topProducts: topProducts.map((p) => ({
        name: p.snapshotName,
        quantity: p._sum.quantity,
        revenue: Number(p._sum.lineTotal),
      })),
    };

    return consolidated;
  }

  /**
   * Lista todos os grupos de negócios (franquias)
   */
  async listBusinessGroups() {
    return this.prisma.businessGroup.findMany({
      include: {
        _count: {
          select: { tenants: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }
}
