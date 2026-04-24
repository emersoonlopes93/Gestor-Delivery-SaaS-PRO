import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class TenantHealthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get health metrics for a specific tenant.
   * Includes order volume, active drivers, and last activity.
   */
  async getTenantHealth(tenantId: string) {
    const [ordersCount, activeDrivers, lastOrder] = await Promise.all([
      this.prisma.order.count({ where: { tenantId } }),
      this.prisma.deliveryDriver.count({ where: { tenantId, status: 'available' } }),
      this.prisma.order.findFirst({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    return {
      tenantId,
      status: ordersCount > 0 ? 'active' : 'idle',
      metrics: {
        totalOrders: ordersCount,
        onlineDrivers: activeDrivers,
        lastActivity: lastOrder?.createdAt || null,
      },
      system: {
        dbHealthy: await this.prisma.isHealthy(),
      },
    };
  }

  /**
   * List health status for all tenants (SaaS Admin view).
   */
  async listAllTenantsHealth() {
    const tenants = await this.prisma.tenant.findMany({
      select: { id: true, name: true, slug: true, status: true },
    });

    // In production, we'd use a more efficient way to aggregate this,
    // like a scheduled job or a materialized view. For now, let's map.
    return Promise.all(
      tenants.map(async (t) => {
        const health = await this.getTenantHealth(t.id);
        return {
          ...t,
          ...health,
        };
      }),
    );
  }
}
