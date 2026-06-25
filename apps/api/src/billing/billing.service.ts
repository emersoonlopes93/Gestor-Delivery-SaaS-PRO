import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';
import { BillingCycle, Prisma, SubscriptionStatus } from '@prisma/client';
import type { CreatePlanDto, UpdatePlanDto, CreateSubscriptionDto, UpdateSubscriptionDto } from './dto/create-plan.dto';
import { AsaasService } from './asaas.service';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  private asJsonObject(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return {};
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
    private readonly asaasService: AsaasService,
  ) {}

  // === PLANS ===
  async createPlan(dto: CreatePlanDto) {
    const tenantId = this.tenantContext.getTenantId();
    const existing = await this.prisma.plan.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new BadRequestException('Já existe um plano com este slug.');
    }

    const plan = await this.prisma.plan.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        price: dto.price,
        billingCycle: dto.billingCycle ?? BillingCycle.monthly,
        features: dto.features ?? {},
        isActive: dto.isActive ?? true,
      },
    });

    this.logger.log(`Created plan ${plan.id} ${tenantId ? `for tenant ${tenantId}` : '(global)'}`);
    return plan;
  }

  async listPlans(includeInactive = false) {
    const where = includeInactive ? {} : { isActive: true };
    return this.prisma.plan.findMany({
      where,
      orderBy: { price: 'asc' },
    });
  }

  async updatePlan(planId: string, dto: UpdatePlanDto) {
    const tenantId = this.tenantContext.getTenantId();
    const plan = await this.prisma.plan.findUnique({
      where: { id: planId },
    });
    if (!plan) {
      throw new NotFoundException('Plano não encontrado.');
    }

    const updated = await this.prisma.plan.update({
      where: { id: planId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.billingCycle && { billingCycle: dto.billingCycle }),
        ...(dto.features && { features: dto.features }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    this.logger.log(`Updated plan ${planId} ${tenantId ? `for tenant ${tenantId}` : '(global)'}`);
    return updated;
  }

  // === SUBSCRIPTIONS ===
  async createSubscription(dto: CreateSubscriptionDto) {
    const plan = await this.prisma.plan.findUnique({
      where: { id: dto.planId },
    });
    if (!plan) {
      throw new NotFoundException('Plano não encontrado.');
    }

    const tenant = await this.prisma.tenant.findUnique({ 
      where: { id: dto.tenantId }, 
      include: { users: { include: { userRoles: true } } } 
    });
    if (!tenant) throw new NotFoundException('Tenant não encontrado.');

    const adminUser = tenant.users.find(u => u.userRoles?.some(ur => ur.roleId === 'ADMIN' || ur.roleId === 'OWNER')) || tenant.users[0];
    const customerEmail = adminUser?.email || `admin@${tenant.slug}.com`;
    const customerPhone = '11999999999'; // TenantUser não possui campo phone no schema atual
    const customerName = tenant.name || adminUser?.name || 'Cliente SaaS';

    // Cria customer no Asaas
    const asaasCustomer = await this.asaasService.createCustomer({
      name: customerName,
      email: customerEmail,
      cpfCnpj: '00000000000', // CPF/CNPJ mockado ou extraído das configs se existir
      phone: customerPhone,
    });

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7); // 7 days trial

    // Tenta criar assinatura no Asaas logo de cara, pra trial (value = 0 na primeira fatura se for trial?
    // O Asaas permite criar subscription com nextDueDate = trialEndsAt.
    const asaasSub = await this.asaasService.createSubscription({
      customer: asaasCustomer.id,
      billingType: 'PIX', // ou cartão, dependendo da UI
      value: Number(plan.price),
      nextDueDate: trialEndsAt.toISOString().split('T')[0],
      cycle: plan.billingCycle === BillingCycle.yearly ? 'YEARLY' : 'MONTHLY',
      description: `Assinatura Plano ${plan.name} - PedeHub`,
    });

    const subscription = await this.prisma.tenantSubscription.upsert({
      where: { tenantId: dto.tenantId },
      update: {
        planId: dto.planId,
        status: SubscriptionStatus.trial,
        trialEndsAt,
        currentPeriodStartsAt: new Date(),
        currentPeriodEndsAt: trialEndsAt,
        asaasCustomerId: asaasCustomer.id,
        asaasSubscriptionId: asaasSub.id,
      },
      create: {
        tenantId: dto.tenantId,
        planId: dto.planId,
        status: SubscriptionStatus.trial,
        trialEndsAt,
        currentPeriodStartsAt: new Date(),
        currentPeriodEndsAt: trialEndsAt,
        asaasCustomerId: asaasCustomer.id,
        asaasSubscriptionId: asaasSub.id,
      },
    });

    this.logger.log(`Created trial subscription for tenant ${dto.tenantId} with Asaas sub: ${asaasSub.id}`);
    return subscription;
  }

  async getCurrentSubscription(tenantId: string) {
    return this.prisma.tenantSubscription.findUnique({
      where: { tenantId },
      include: { plan: true },
    });
  }

  async updateSubscription(tenantId: string, dto: UpdateSubscriptionDto) {
    const subscription = await this.prisma.tenantSubscription.findUnique({
      where: { tenantId },
    });
    if (!subscription) {
      throw new NotFoundException('Assinatura não encontrada.');
    }

    const updateData: Prisma.TenantSubscriptionUpdateArgs['data'] = {};
    if (dto.status) updateData.status = dto.status as SubscriptionStatus;
    if (dto.planId) updateData.planId = dto.planId;

    // If upgrading/downgrading plan, reset period
    if (dto.planId && dto.planId !== subscription.planId) {
      const newPlan = await this.prisma.plan.findUnique({
        where: { id: dto.planId },
      });
      if (!newPlan) {
        throw new NotFoundException('Novo plano não encontrado.');
      }

      updateData.currentPeriodStartsAt = new Date();
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + (newPlan.billingCycle === BillingCycle.yearly ? 12 : 1));
      updateData.currentPeriodEndsAt = periodEnd;
    }

    const updated = await this.prisma.tenantSubscription.update({
      where: { tenantId },
      data: updateData,
    });

    this.logger.log(`Updated subscription for tenant ${tenantId}`);
    return updated;
  }

  // === FEATURE GATING ===
  async hasFeature(tenantId: string, feature: string): Promise<boolean> {
    const subscription = await this.getCurrentSubscription(tenantId);
    if (!subscription || subscription.status === SubscriptionStatus.canceled) {
      return false;
    }

    const featuresObj = this.asJsonObject(subscription.plan?.features);
    const value = featuresObj[feature];
    return typeof value === 'boolean' ? value : false;
  }

  async checkAccess(tenantId: string): Promise<{
    canAccess: boolean;
    reason?: string;
    subscription?: Prisma.TenantSubscriptionGetPayload<{ include: { plan: true } }>;
  }> {
    const subscription = await this.getCurrentSubscription(tenantId);
    
    if (!subscription) {
      return { canAccess: false, reason: 'Sem assinatura ativa.' };
    }

    if (subscription.status === SubscriptionStatus.trial) {
      const now = new Date();
      if (now > subscription.trialEndsAt!) {
        return { canAccess: false, reason: 'Trial expirado.' };
      }
    }

    if (subscription.status === SubscriptionStatus.overdue) {
      return { canAccess: false, reason: 'Assinatura em atraso.' };
    }

    if (subscription.status === SubscriptionStatus.suspended) {
      return { canAccess: false, reason: 'Assinatura suspensa.' };
    }

    if (subscription.status === SubscriptionStatus.canceled) {
      return { canAccess: false, reason: 'Assinatura cancelada.' };
    }

    const now = new Date();
    if (now > subscription.currentPeriodEndsAt!) {
      // Auto-renew logic would go here
      return { canAccess: false, reason: 'Assinatura expirada.' };
    }

    return { canAccess: true, subscription };
  }
}
