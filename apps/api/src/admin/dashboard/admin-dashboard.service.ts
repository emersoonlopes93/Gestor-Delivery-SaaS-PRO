import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

interface DashboardStats {
  activeTenants: number;
  trialTenants: number;
  totalTenants: number;
  mrr: number;
  supportTickets: number;
}

interface ActivityItem {
  id: string;
  tenantId: string;
  tenantName: string;
  action: string;
  resource: string | null;
  createdAt: string;
}

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(): Promise<DashboardStats> {
    const [
      totalTenants,
      activeTenants,
      trialTenants,
      plans,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { status: 'active' } }),
      this.prisma.tenant.count({ where: { status: 'trial' } }),
      this.prisma.plan.findMany({ where: { isActive: true } }),
    ]);

    // Calcular MRR (Monthly Recurring Revenue)
    const activeSubscriptions = await this.prisma.tenantSubscription.count({
      where: {
        status: 'active',
        planId: { in: plans.map(p => p.id) },
      },
    });

    const mrr = plans.reduce((total, plan) => {
      const planSubscriptions = activeSubscriptions; // Simplificado - na prática calcularia por plano
      return total + (Number(plan.price) * planSubscriptions);
    }, 0);

    return {
      totalTenants,
      activeTenants,
      trialTenants,
      mrr,
      supportTickets: 0, // Implementar quando tiver sistema de tickets
    };
  }

  async getRecentActivity(): Promise<{ items: ActivityItem[] }> {
    const recentLogs = await this.prisma.auditLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const items: ActivityItem[] = recentLogs.map(log => ({
      id: log.id,
      tenantId: log.tenantId,
      tenantName: log.tenant?.name || 'Unknown',
      action: log.action,
      resource: log.resource,
      createdAt: log.createdAt.toISOString(),
    }));

    return { items };
  }
}