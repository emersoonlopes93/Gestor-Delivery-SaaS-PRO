import { Injectable } from '@nestjs/common';
import { Prisma, BillingPlan } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class BillingPlansService {
  constructor(private readonly prisma: PrismaService) {}

  async getPlanById(planId: string): Promise<BillingPlan | null> {
    return this.prisma.billingPlan.findUnique({
      where: { id: planId },
    });
  }

  async listPlans(includeInactive = false): Promise<BillingPlan[]> {
    return this.prisma.billingPlan.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createPlan(data: Prisma.BillingPlanCreateInput): Promise<BillingPlan> {
    return this.prisma.billingPlan.create({ data });
  }
}
