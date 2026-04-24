import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async getOnboardingStatus(tenantId: string) {
    let onboarding = await this.prisma.tenantOnboarding.findUnique({
      where: { tenantId },
    });

    if (!onboarding) {
      onboarding = await this.prisma.tenantOnboarding.create({
        data: { tenantId },
      });
    }

    return onboarding;
  }

  async updateStep(tenantId: string, step: 'basicInfo' | 'catalog' | 'payment' | 'firstOrder', completed: boolean = true) {
    const data: any = {};
    if (step === 'basicInfo') data.stepBasicInfo = completed;
    if (step === 'catalog') data.stepCatalog = completed;
    if (step === 'payment') data.stepPayment = completed;
    if (step === 'firstOrder') data.stepFirstOrder = completed;

    const onboarding = await this.prisma.tenantOnboarding.upsert({
      where: { tenantId },
      create: { ...data, tenantId },
      update: data,
    });

    // If all steps completed, mark completion date
    if (
      onboarding.stepBasicInfo &&
      onboarding.stepCatalog &&
      onboarding.stepPayment &&
      onboarding.stepFirstOrder &&
      !onboarding.completedAt
    ) {
      return this.prisma.tenantOnboarding.update({
        where: { tenantId },
        data: { completedAt: new Date() },
      });
    }

    return onboarding;
  }
}
