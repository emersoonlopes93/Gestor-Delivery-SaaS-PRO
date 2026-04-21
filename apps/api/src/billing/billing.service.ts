import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantContextService } from '../common/context/tenant-context.service';
import { BillingCycle, SubscriptionStatus, Prisma } from '@prisma/client';
import type { CreatePlanDto, UpdatePlanDto, CreateSubscriptionDto, UpdateSubscriptionDto } from './dto/create-plan.dto';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  // === PLANS ===
  async createPlan(dto: CreatePlanDto) {
    const tenantId = this.tenantContext.getTenantId();
    const existing = await this.prisma.tenantClient.plan.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new BadRequestException('Já existe um plano com este slug.');
    }

    const plan = await this.prisma.tenantClient.plan.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        price: dto.price,
        billingCycle: dto.billingCycle ?? BillingCycle.monthly,
        features: dto.features ?? {},
        isActive: dto.isActive ?? true,
      },
    });

    this.logger.log(`Created plan ${plan.id} for tenant ${tenantId}`);
    return plan;
  }

  async listPlans() {
    const tenantId = this.tenantContext.getTenantId();
    return this.prisma.tenantClient.plan.findMany({
      where: { isActive: true },
      orderBy: { price: 'asc' },
    });
  }

  async updatePlan(planId: string, dto: UpdatePlanDto) {
    const tenantId = this.tenantContext.getTenantId();
    const plan = await this.prisma.tenantClient.plan.findUnique({
      where: { id: planId },
    });
    if (!plan) {
      throw new NotFoundException('Plano não encontrado.');
    }

    const updated = await this.prisma.tenantClient.plan.update({
      where: { id: planId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.billingCycle && { billingCycle: dto.billingCycle }),
        ...(dto.features && { features: dto.features }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    this.logger.log(`Updated plan ${planId} for tenant ${tenantId}`);
    return updated;
  }

  // === SUBSCRIPTIONS ===
  async createSubscription(dto: CreateSubscriptionDto) {
    const plan = await this.prisma.tenantClient.plan.findUnique({
      where: { id: dto.planId },
    });
    if (!plan) {
      throw new NotFoundException('Plano não encontrado.');
    }

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7); // 7 days trial

    const subscription = await this.prisma.tenantClient.tenantSubscription.upsert({
      where: { tenantId: dto.tenantId },
      update: {
        planId: dto.planId,
        status: SubscriptionStatus.trial,
        trialEndsAt,
        currentPeriodStartsAt: new Date(),
        currentPeriodEndsAt: trialEndsAt,
      },
      create: {
        tenantId: dto.tenantId,
        planId: dto.planId,
        status: SubscriptionStatus.trial,
        trialEndsAt,
        currentPeriodStartsAt: new Date(),
        currentPeriodEndsAt: trialEndsAt,
      },
    });

    this.logger.log(`Created trial subscription for tenant ${dto.tenantId}`);
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

    const updateData: any = {};
    if (dto.status) updateData.status = dto.status;
    if (dto.planId) updateData.planId = dto.planId;

    // If upgrading/downgrading plan, reset period
    if (dto.planId && dto.planId !== subscription.planId) {
      const newPlan = await this.prisma.tenantClient.plan.findUnique({
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

    const features = subscription.plan?.features as Record<string, boolean> | undefined;
    return features?.[feature] ?? false;
  }

  async checkAccess(tenantId: string): Promise<{
    canAccess: boolean;
    reason?: string;
    subscription?: any;
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
