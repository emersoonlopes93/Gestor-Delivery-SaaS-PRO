import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, TenantOnboarding } from '@prisma/client';
import type { OnboardingBackendStep, OnboardingCompletionCheck } from '@gestor/types';
import { PrismaService } from '../database/prisma.service';

type CompletionSnapshot = {
  tenant: {
    name: string;
    onboarding: TenantOnboarding | null;
    settings: {
      businessPhone: string | null;
      logoUrl: string | null;
      street: string | null;
      number: string | null;
      neighborhood: string | null;
      city: string | null;
      state: string | null;
      zipCode: string | null;
      lat: number | null;
      lng: number | null;
      paymentMethods: unknown;
    } | null;
    operatingHours: Array<{ isOpen: boolean }>;
  } | null;
  deliveryCoverage: {
    isDeliveryEnabled: boolean;
    maxRadiusKm: Prisma.Decimal;
    defaultPricePerKm: Prisma.Decimal;
    storeLat: number;
    storeLng: number;
  } | null;
  activeProductCount: number;
};

const STEP_MAPPING: Record<string, keyof Prisma.TenantOnboardingUpdateInput> = {
  basicInfo: 'stepBasicInfo',
  operatingHours: 'stepOperatingHours',
  logo: 'stepLogo',
  address: 'stepAddress',
  delivery: 'stepDelivery',
  payment: 'stepPayments',
  payments: 'stepPayments',
  whatsapp: 'stepWhatsapp',
  menu: 'stepMenu',
  catalog: 'stepCatalog',
  firstOrder: 'stepFirstOrder',
};

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

  async updateStep(tenantId: string, step: OnboardingBackendStep | string, completed = true) {
    const fieldName =
      STEP_MAPPING[step] ||
      (`step${step.charAt(0).toUpperCase()}${step.slice(1)}` as keyof Prisma.TenantOnboardingUpdateInput);

    const updateData: Prisma.TenantOnboardingUpdateInput = {
      [fieldName]: completed,
    };

    return this.prisma.tenantOnboarding.upsert({
      where: { tenantId },
      create: {
        tenantId,
        [fieldName]: completed,
      } as Prisma.TenantOnboardingUncheckedCreateInput,
      update: updateData,
    });
  }

  async getCompletionCheck(tenantId: string): Promise<OnboardingCompletionCheck> {
    const snapshot = await this.loadCompletionSnapshot(tenantId);
    return this.buildCompletionCheck(snapshot);
  }

  async completeOnboarding(tenantId: string) {
    const snapshot = await this.loadCompletionSnapshot(tenantId);
    const completion = this.buildCompletionCheck(snapshot);

    if (!completion.canComplete) {
      throw new BadRequestException({
        message: 'Os requisitos minimos do onboarding ainda nao foram atendidos.',
        ...completion,
      });
    }

    const tenant = snapshot.tenant;
    const settings = tenant?.settings;
    const hasLogo = Boolean(settings?.logoUrl?.trim());
    const hasBusinessPhone = Boolean(settings?.businessPhone?.trim());
    const hasAddress = this.hasStructuredAddress(settings);
    const hasCoordinates = this.hasCoordinates(settings);
    const hasPaymentMethods = this.getPaymentMethods(settings?.paymentMethods).length > 0;
    const hasOperatingHours = Boolean(tenant?.operatingHours.some((hour) => hour.isOpen));
    const hasProducts = snapshot.activeProductCount > 0;
    const deliveryConfigured = this.isDeliveryConfigured(snapshot);

    const onboarding = await this.prisma.tenantOnboarding.upsert({
      where: { tenantId },
      create: {
        tenantId,
        stepBasicInfo: Boolean(tenant?.name.trim() && hasBusinessPhone),
        stepOperatingHours: hasOperatingHours,
        stepLogo: hasLogo,
        stepAddress: hasAddress && hasCoordinates,
        stepDelivery: deliveryConfigured,
        stepPayments: hasPaymentMethods,
        stepMenu: hasProducts,
        stepCatalog: hasProducts,
        completedAt: new Date(),
      },
      update: {
        stepBasicInfo: Boolean(tenant?.name.trim() && hasBusinessPhone),
        stepOperatingHours: hasOperatingHours,
        stepLogo: hasLogo,
        stepAddress: hasAddress && hasCoordinates,
        stepDelivery: deliveryConfigured,
        stepPayments: hasPaymentMethods,
        stepMenu: hasProducts,
        stepCatalog: hasProducts,
        completedAt: new Date(),
      },
    });

    return {
      ...completion,
      canComplete: true,
      completedAt: onboarding.completedAt?.toISOString() ?? new Date().toISOString(),
    };
  }

  private async loadCompletionSnapshot(tenantId: string): Promise<CompletionSnapshot> {
    const [tenant, deliveryCoverage, activeProductCount] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        include: {
          onboarding: true,
          settings: {
            select: {
              businessPhone: true,
              logoUrl: true,
              street: true,
              number: true,
              neighborhood: true,
              city: true,
              state: true,
              zipCode: true,
              lat: true,
              lng: true,
              paymentMethods: true,
            },
          },
          operatingHours: {
            select: { isOpen: true },
          },
        },
      }),
      this.prisma.deliveryCoverageConfig.findUnique({
        where: { tenantId },
        select: {
          isDeliveryEnabled: true,
          maxRadiusKm: true,
          defaultPricePerKm: true,
          storeLat: true,
          storeLng: true,
        },
      }),
      this.prisma.product.count({
        where: {
          tenantId,
          isActive: true,
          deletedAt: null,
        },
      }),
    ]);

    return {
      tenant,
      deliveryCoverage,
      activeProductCount,
    };
  }

  private buildCompletionCheck(snapshot: CompletionSnapshot): OnboardingCompletionCheck {
    const missingRequirements: string[] = [];
    const warnings: string[] = [];
    const tenant = snapshot.tenant;
    const settings = tenant?.settings;

    if (!tenant?.name?.trim()) {
      missingRequirements.push('store_name');
    }

    if (!this.hasStructuredAddress(settings)) {
      missingRequirements.push('structured_address');
    }

    if (!this.hasCoordinates(settings)) {
      missingRequirements.push('store_coordinates');
    }

    if (!tenant?.operatingHours.some((hour) => hour.isOpen)) {
      missingRequirements.push('operating_hours');
    }

    if (this.getPaymentMethods(settings?.paymentMethods).length === 0) {
      missingRequirements.push('payment_methods');
    }

    if (snapshot.activeProductCount === 0) {
      missingRequirements.push('catalog');
    }

    if (snapshot.deliveryCoverage?.isDeliveryEnabled && !this.isDeliveryConfigured(snapshot)) {
      missingRequirements.push('delivery_config');
    }

    if (!settings?.businessPhone?.trim()) {
      warnings.push('business_phone_recommended');
    }

    if (!settings?.logoUrl?.trim()) {
      warnings.push('logo_optional_missing');
    }

    if (!snapshot.deliveryCoverage?.isDeliveryEnabled) {
      warnings.push('delivery_not_enabled');
    }

    if (!tenant) {
      missingRequirements.push('tenant_not_found');
    }

    return {
      canComplete: missingRequirements.length === 0,
      missingRequirements,
      warnings,
      nextRecommendedStep: this.resolveNextRecommendedStep(missingRequirements),
      completedAt: tenant?.onboarding?.completedAt?.toISOString() ?? null,
    };
  }

  private getPaymentMethods(raw: unknown): string[] {
    return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
  }

  private hasStructuredAddress(
    settings:
      | {
          street: string | null;
          number: string | null;
          neighborhood: string | null;
          city: string | null;
          state: string | null;
          zipCode: string | null;
        }
      | null
      | undefined,
  ): boolean {
    return Boolean(
      settings?.street?.trim() &&
        settings?.number?.trim() &&
        settings?.neighborhood?.trim() &&
        settings?.city?.trim() &&
        settings?.state?.trim() &&
        settings?.zipCode?.trim(),
    );
  }

  private hasCoordinates(
    settings:
      | {
          lat: number | null;
          lng: number | null;
        }
      | null
      | undefined,
  ): boolean {
    return (
      typeof settings?.lat === 'number' &&
      Number.isFinite(settings.lat) &&
      settings.lat !== 0 &&
      typeof settings?.lng === 'number' &&
      Number.isFinite(settings.lng) &&
      settings.lng !== 0
    );
  }

  private isDeliveryConfigured(snapshot: CompletionSnapshot): boolean {
    const coverage = snapshot.deliveryCoverage;
    const settings = snapshot.tenant?.settings;

    if (!coverage || !coverage.isDeliveryEnabled) {
      return false;
    }

    if (!this.hasCoordinates(settings)) {
      return false;
    }

    return Number(coverage.maxRadiusKm) > 0 && Number(coverage.defaultPricePerKm) >= 0;
  }

  private resolveNextRecommendedStep(missingRequirements: string[]): string | null {
    if (missingRequirements.includes('store_name')) return 'identity';
    if (missingRequirements.includes('structured_address') || missingRequirements.includes('store_coordinates')) {
      return 'location';
    }
    if (missingRequirements.includes('operating_hours')) return 'hours';
    if (missingRequirements.includes('payment_methods')) return 'payments';
    if (missingRequirements.includes('catalog')) return 'products';
    if (missingRequirements.includes('delivery_config')) return 'location';
    return null;
  }
}
