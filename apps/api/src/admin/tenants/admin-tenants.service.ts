import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TenantBillingResolverService } from '../../billing/tenant-billing-resolver.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AdminTenantsService {
  private readonly logger = new Logger('AdminTenantsService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantBillingResolver: TenantBillingResolverService,
  ) {}

  /**
   * List all tenants (admin view).
   */
  async findAll(page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;

    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        skip,
        take: pageSize,
        include: {
          settings: true,
          billingSubscriptions: {
            include: { billingPlan: true },
            orderBy: [{ createdAt: 'desc' }],
            take: 1,
          },
          subscription: { include: { plan: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tenant.count(),
    ]);

    return {
      items: tenants,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasNext: page * pageSize < total,
      hasPrevious: page > 1,
    };
  }

  /**
   * Health overview of tenants (V1)
   */
  async getHealthOverview(page = 1, pageSize = 20, search?: string, operationalStatus?: string, billingStatus?: string, whatsappStatus?: string) {
    const skip = (page - 1) * pageSize;
    const where: Prisma.TenantWhereInput = {};
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }
    
    if (operationalStatus) {
      where.status = operationalStatus as import('@prisma/client').TenantStatus;
    }

    if (whatsappStatus) {
      if (whatsappStatus === 'none') {
        where.whatsappInstance = { is: null };
      } else {
        where.whatsappInstance = { status: whatsappStatus as import('@prisma/client').WhatsAppInstanceStatus };
      }
    }

    if (billingStatus) {
      if (billingStatus === 'none') {
        where.billingSubscriptions = { none: {} };
      } else {
        where.billingSubscriptions = { some: { status: billingStatus as import('@prisma/client').TenantSubscriptionStatus } };
      }
    }

    const [tenants, total, statsCount] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          whatsappInstance: { select: { status: true, phoneNumber: true, providerType: true, updatedAt: true } },
          orders: { take: 1, orderBy: { createdAt: 'desc' }, select: { createdAt: true, total: true } },
          billingSubscriptions: { orderBy: { createdAt: 'desc' }, take: 1, select: { status: true } },
          subscription: { select: { status: true } },
        }
      }),
      this.prisma.tenant.count({ where }),
      Promise.all([
        this.prisma.tenant.count(),
        this.prisma.tenant.count({ where: { status: 'active' } }),
        this.prisma.tenant.count({ where: { status: 'suspended' } }),
      ])
    ]);

    const globalStats = {
      total: statsCount[0],
      active: statsCount[1],
      suspended: statsCount[2],
      pastDue: 0, 
      trailing: 0,
    };

    const items = tenants.map(t => {
      const bStatus = t.billingSubscriptions?.[0]?.status ?? t.subscription?.status ?? 'none';
      const wStatus = t.whatsappInstance?.status ?? 'none';
      const lastOrder = t.orders?.[0];

      const alerts: Array<{ type: string; severity: string; message: string; createdAt: string }> = [];

      if (t.status === 'suspended') {
        alerts.push({ type: 'operational', severity: 'critical', message: 'Tenant suspenso', createdAt: new Date().toISOString() });
      }

      if (bStatus === 'overdue') {
        alerts.push({ type: 'financial', severity: 'high', message: 'Assinatura inadimplente', createdAt: new Date().toISOString() });
      }

      if (t.status === 'active' && wStatus === 'disconnected') {
        alerts.push({ type: 'operational', severity: 'high', message: 'WhatsApp desconectado', createdAt: new Date().toISOString() });
      }

      if (t.status === 'active') {
        if (!lastOrder) {
          alerts.push({ type: 'operational', severity: 'medium', message: 'Nenhum pedido registrado', createdAt: new Date().toISOString() });
        } else {
          const daysAgo = (new Date().getTime() - new Date(lastOrder.createdAt).getTime()) / (1000 * 3600 * 24);
          if (daysAgo > 7) {
            alerts.push({ type: 'operational', severity: 'medium', message: 'Sem pedidos recentes (>7 dias)', createdAt: new Date().toISOString() });
          }
        }
      }

      return {
        tenantId: t.id,
        tenantName: t.name,
        slug: t.slug,
        operationalStatus: t.status,
        billingStatus: bStatus,
        createdAt: t.createdAt.toISOString(),
        whatsapp: t.whatsappInstance ? {
          status: t.whatsappInstance.status,
          connectedNumber: t.whatsappInstance.phoneNumber,
          providerType: t.whatsappInstance.providerType,
          lastUpdatedAt: t.whatsappInstance.updatedAt.toISOString(),
        } : null,
        orders: lastOrder ? {
          lastOrderAt: lastOrder.createdAt.toISOString(),
          lastOrderTotal: lastOrder.total,
        } : null,
        alerts,
      };
    });

    return {
      items,
      stats: globalStats,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasNext: page * pageSize < total,
      hasPrevious: page > 1,
    };
  }

  /**
   * Find a tenant by ID (admin view).
   */
  async findById(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        settings: true,
        billingSubscriptions: {
          include: { billingPlan: { include: { revenueTiers: { orderBy: [{ sortOrder: 'asc' }] } } } },
          orderBy: [{ createdAt: 'desc' }],
          take: 1,
        },
        billingCycles: { orderBy: [{ startedAt: 'desc' }], take: 1 },
        invoices: { orderBy: [{ createdAt: 'desc' }], take: 1 },
        subscription: { include: { plan: true } },
        _count: {
          select: { users: true, roles: true },
        },
      },
    });

    if (!tenant) return null;
    const billingState = await this.tenantBillingResolver.getTenantBillingState(id);
    return { ...tenant, billingState };
  }

  async create(data: { name: string; slug: string; status?: 'active' | 'inactive' | 'suspended' | 'trial'; billingPlanId?: string }) {
    const existing = await this.prisma.tenant.findUnique({ where: { slug: data.slug } });
    if (existing) {
      throw new Error('Slug já está em uso');
    }

    const tenant = await this.prisma.tenant.create({
      data: {
        name: data.name,
        slug: data.slug,
        status: data.status ?? 'trial',
        settings: { create: {} },
        onboarding: { create: {} },
      },
    });

    await this.prisma.schedulingSettings.create({
      data: {
        tenantId: tenant.id,
      },
    });

    const subscription = await this.tenantBillingResolver.getOrCreateTenantBillingSubscription(tenant.id, data.billingPlanId);
    this.logger.log(`Tenant ${tenant.id} criado com Billing V2 subscription ${subscription.id}`);
    return this.findById(tenant.id);
  }

  async createBillingV2Subscription(id: string, planId?: string) {
    await this.tenantBillingResolver.getOrCreateTenantBillingSubscription(id, planId);
    return this.findById(id);
  }

  /**
   * Update tenant status (activate/suspend).
   */
  async updateStatus(id: string, status: 'active' | 'inactive' | 'suspended' | 'trial', adminId?: string, reason?: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
    });

    if (!tenant) {
      throw new Error('Tenant não encontrado');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenant.update({
        where: { id },
        data: { status },
      });

      const subscription = await tx.tenantBillingSubscription.findFirst({
        where: { tenantId: id },
        orderBy: [{ createdAt: 'desc' }],
      });

      if (subscription && (status === 'suspended' || status === 'active')) {
        const nextBillingStatus = status === 'suspended' ? 'suspended' : 'active';
        await tx.tenantBillingSubscription.update({
          where: { id: subscription.id },
          data: {
            status: nextBillingStatus,
            suspendedAt: status === 'suspended' ? new Date() : null,
            gracePeriodEndsAt: status === 'active' ? null : subscription.gracePeriodEndsAt,
          },
        });

        if (subscription.status !== nextBillingStatus) {
          await tx.subscriptionStatusHistory.create({
            data: {
              tenantId: id,
              subscriptionId: subscription.id,
              previousStatus: subscription.status,
              nextStatus: nextBillingStatus,
                reason: reason?.trim() || (status === 'suspended' ? 'admin_suspended_tenant' : 'admin_reactivated_tenant'),
                source: 'saas_admin',
                actorType: adminId ? 'admin' : 'system',
                actorId: adminId ?? null,
                metadata: {
                  previousTenantStatus: tenant.status,
                  nextTenantStatus: status,
                  reason: reason?.trim() ?? null,
                },
              },
            });
          }
      }

      await tx.auditLog.create({
        data: {
          tenantId: id,
          userId: adminId ?? null,
          userType: adminId ? 'admin' : 'system',
          action: 'admin.tenant_status_updated',
          resource: 'tenant',
          details: {
            previousStatus: tenant.status,
            nextStatus: status,
            billingSubscriptionId: subscription?.id ?? null,
            billingStatusUpdated: Boolean(subscription && (status === 'suspended' || status === 'active')),
            reason: reason?.trim() ?? null,
          },
        },
      });

      return updated;
    });
  }

  /**
   * Update tenant basic info.
   */
  async update(id: string, data: { name?: string; slug?: string }) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
    });

    if (!tenant) {
      throw new Error('Tenant não encontrado');
    }

    // Se mudar slug, verificar unicidade
    if (data.slug && data.slug !== tenant.slug) {
      const existing = await this.prisma.tenant.findUnique({
        where: { slug: data.slug },
      });

      if (existing) {
        throw new Error('Slug já está em uso');
      }
    }

    return this.prisma.tenant.update({
      where: { id },
      data,
    });
  }
}
