import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TenantBillingResolverService } from '../../billing/tenant-billing-resolver.service';

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
  async updateStatus(id: string, status: 'active' | 'inactive' | 'suspended' | 'trial', adminId?: string) {
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
        await tx.tenantBillingSubscription.update({
          where: { id: subscription.id },
          data: {
            status: status === 'suspended' ? 'suspended' : 'active',
            suspendedAt: status === 'suspended' ? new Date() : null,
            gracePeriodEndsAt: status === 'active' ? null : subscription.gracePeriodEndsAt,
          },
        });
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
