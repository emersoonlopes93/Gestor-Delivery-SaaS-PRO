/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';
import { BillingCycle, Prisma, TenantSubscriptionStatus, PaymentProvider } from '@prisma/client';
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

    let subscription = await this.prisma.tenantBillingSubscription.findFirst({
      where: { tenantId: dto.tenantId },
    });

    if (subscription) {
      subscription = await this.prisma.tenantBillingSubscription.update({
        where: { id: subscription.id },
        data: {
          billingPlanId: dto.planId,
          status: TenantSubscriptionStatus.trialing,
          trialEndsAt,
          currentCycleStartedAt: new Date(),
          currentCycleEndsAt: trialEndsAt,
          providerCustomerId: asaasCustomer.id,
          providerSubscriptionId: asaasSub.id,
        },
      });
    } else {
      subscription = await this.prisma.tenantBillingSubscription.create({
        data: {
          tenantId: dto.tenantId,
          billingPlanId: dto.planId,
          status: TenantSubscriptionStatus.trialing,
          trialEndsAt,
          currentCycleStartedAt: new Date(),
          currentCycleEndsAt: trialEndsAt,
          providerCustomerId: asaasCustomer.id,
          providerSubscriptionId: asaasSub.id,
        },
      });
    }

    this.logger.log(`Created trial subscription for tenant ${dto.tenantId} with Asaas sub: ${asaasSub.id}`);
    return subscription;
  }

  async getCurrentSubscription(tenantId: string) {
    return this.prisma.tenantBillingSubscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: { billingPlan: true },
    });
  }

  async updateSubscription(tenantId: string, dto: UpdateSubscriptionDto) {
    const subscription = await this.prisma.tenantBillingSubscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    if (!subscription) {
      throw new NotFoundException('Assinatura não encontrada.');
    }

    const updateData: Prisma.TenantBillingSubscriptionUpdateArgs['data'] = {};
    if (dto.status) updateData.status = dto.status as TenantSubscriptionStatus;
    if (dto.planId) updateData.billingPlanId = dto.planId;

    // If upgrading/downgrading plan, reset period
    if (dto.planId && dto.planId !== subscription.billingPlanId) {
      const newPlan = await this.prisma.plan.findUnique({
        where: { id: dto.planId },
      });
      if (!newPlan) {
        throw new NotFoundException('Novo plano não encontrado.');
      }

      updateData.currentCycleStartedAt = new Date();
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + (newPlan.billingCycle === BillingCycle.yearly ? 12 : 1));
      updateData.currentCycleEndsAt = periodEnd;
    }

    const updated = await this.prisma.tenantBillingSubscription.update({
      where: { id: subscription.id },
      data: updateData,
    });

    this.logger.log(`Updated subscription for tenant ${tenantId}`);
    return updated;
  }

  // === FEATURE GATING ===
  async hasFeature(tenantId: string, feature: string): Promise<boolean> {
    const subscription = await this.getCurrentSubscription(tenantId);
    if (!subscription || subscription.status === TenantSubscriptionStatus.canceled) {
      return false;
    }

    if (subscription.billingPlan?.allowAllModules) {
      return true;
    }

    // Simplificação para a versão v2 do BillingPlan que não possui mais a coluna 'features'.
    // Em uma implementação real, deveríamos checar a tabela BillingPlanModule ou os módulos incluídos.
    return false;
  }

  async checkAccess(tenantId: string): Promise<{
    canAccess: boolean;
    reason?: string;
    subscription?: Prisma.TenantBillingSubscriptionGetPayload<{ include: { billingPlan: true } }>;
  }> {
    const subscription = await this.getCurrentSubscription(tenantId);
    
    if (!subscription) {
      return { canAccess: false, reason: 'Sem assinatura ativa.' };
    }

    if (subscription.status === TenantSubscriptionStatus.trialing) {
      const now = new Date();
      if (now > subscription.trialEndsAt!) {
        return { canAccess: false, reason: 'Trial expirado.' };
      }
    }

    if (subscription.status === TenantSubscriptionStatus.past_due) {
      return { canAccess: false, reason: 'Assinatura em atraso.' };
    }

    if (subscription.status === TenantSubscriptionStatus.suspended) {
      return { canAccess: false, reason: 'Assinatura suspensa.' };
    }

    if (subscription.status === TenantSubscriptionStatus.canceled) {
      return { canAccess: false, reason: 'Assinatura cancelada.' };
    }

    const now = new Date();
    if (subscription.currentCycleEndsAt && now > subscription.currentCycleEndsAt) {
      // Auto-renew logic would go here
      return { canAccess: false, reason: 'Assinatura expirada.' };
    }

    return { canAccess: true, subscription };
  }
}
