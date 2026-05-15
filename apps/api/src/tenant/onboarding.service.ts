import { Injectable } from '@nestjs/common';
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

  async updateStep(tenantId: string, step: string, completed: boolean = true) {
    const data: any = {};
    
    // Mapeamento de nomes de passos para campos no banco (caso não sigam o padrão simples)
    const stepMapping: Record<string, string> = {
      'payment': 'stepPayments',
      'payments': 'stepPayments',
    };

    const fieldName = stepMapping[step] || `step${step.charAt(0).toUpperCase()}${step.slice(1)}`;
    data[fieldName] = completed;

    const onboarding = await this.prisma.tenantOnboarding.upsert({
      where: { tenantId },
      create: { ...data, tenantId },
      update: data,
    });

    // Check if all essential steps are completed
    const essentialSteps = [
      onboarding.stepBasicInfo,
      onboarding.stepOperatingHours,
      onboarding.stepLogo,
      onboarding.stepAddress,
      onboarding.stepCatalog,
      onboarding.stepMenu,
    ];

    if (essentialSteps.every(Boolean) && !onboarding.completedAt) {
      return this.prisma.tenantOnboarding.update({
        where: { tenantId },
        data: { completedAt: new Date() },
      });
    }

    return onboarding;
  }

  async completeOnboarding(tenantId: string) {
    return this.prisma.tenantOnboarding.upsert({
      where: { tenantId },
      create: { 
        tenantId, 
        stepBasicInfo: true, 
        stepOperatingHours: true,
        stepLogo: true,
        stepAddress: true,
        stepDelivery: true,
        stepPayments: true,
        stepWhatsapp: true,
        stepMenu: true,
        stepCatalog: true, 
        stepFirstOrder: true, 
        completedAt: new Date() 
      },
      update: { 
        stepBasicInfo: true, 
        stepOperatingHours: true,
        stepLogo: true,
        stepAddress: true,
        stepDelivery: true,
        stepPayments: true,
        stepWhatsapp: true,
        stepMenu: true,
        stepCatalog: true,
        completedAt: new Date() 
      },
    });
  }
}
