import { Injectable } from '@nestjs/common';
import { BillingModuleAddon, Prisma, TenantAddon, TenantAddonStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

const ZERO = new Prisma.Decimal(0);
const AI_ADDON_KEY = 'ai_agent';

export type TenantAddonSummary = TenantAddon & {
  billingAddon: BillingModuleAddon | null;
};

@Injectable()
export class BillingAddonService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureAiAddonDefinition(tx: Prisma.TransactionClient | PrismaService = this.prisma) {
    return tx.billingModuleAddon.upsert({
      where: { addonKey: AI_ADDON_KEY },
      update: {
        moduleKey: 'ai_agent',
        name: 'Add-on Agente IA',
        description: 'Libera o Agente IA com cota controlada para evitar custo ilimitado.',
      },
      create: {
        addonKey: AI_ADDON_KEY,
        moduleKey: 'ai_agent',
        name: 'Add-on Agente IA',
        description: 'Libera o Agente IA com cota controlada para evitar custo ilimitado.',
        pricingType: 'fixed',
        price: new Prisma.Decimal(70),
        isActive: true,
      },
    });
  }

  async listActiveTenantAddons(tenantId: string): Promise<TenantAddonSummary[]> {
    return this.prisma.tenantAddon.findMany({
      where: {
        tenantId,
        status: { in: [TenantAddonStatus.active, TenantAddonStatus.scheduled_cancel] },
      },
      include: { billingAddon: true },
      orderBy: [{ createdAt: 'asc' }],
    });
  }

  async calculateActiveAddonsAmount(tenantId: string): Promise<Prisma.Decimal> {
    const active = await this.listActiveTenantAddons(tenantId);
    return active.reduce((sum, addon) => sum.plus(addon.price), ZERO);
  }

  async activateAiAddon(tenantId: string): Promise<TenantAddonSummary> {
    const definition = await this.ensureAiAddonDefinition();
    const now = new Date();
    const currentPeriodEndsAt = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

    return this.prisma.tenantAddon.upsert({
      where: {
        tenantId_addonKey: {
          tenantId,
          addonKey: AI_ADDON_KEY,
        },
      },
      update: {
        billingAddonId: definition.id,
        status: TenantAddonStatus.active,
        price: definition.price,
        cancelAtCycleEnd: true,
        canceledAt: null,
        currentPeriodEndsAt,
      },
      create: {
        tenantId,
        addonKey: AI_ADDON_KEY,
        billingAddonId: definition.id,
        status: TenantAddonStatus.active,
        price: definition.price,
        cancelAtCycleEnd: true,
        currentPeriodEndsAt,
      },
      include: { billingAddon: true },
    });
  }

  async cancelAiAddon(tenantId: string): Promise<TenantAddonSummary | null> {
    const existing = await this.prisma.tenantAddon.findUnique({
      where: {
        tenantId_addonKey: {
          tenantId,
          addonKey: AI_ADDON_KEY,
        },
      },
      include: { billingAddon: true },
    });

    if (!existing) return null;

    return this.prisma.tenantAddon.update({
      where: { id: existing.id },
      data: {
        status: TenantAddonStatus.scheduled_cancel,
        cancelAtCycleEnd: true,
        canceledAt: new Date(),
      },
      include: { billingAddon: true },
    });
  }

  async buildAddonInvoiceItems(tenantId: string): Promise<Array<{
    type: string;
    description: string;
    quantity: number;
    unitAmount: Prisma.Decimal;
    totalAmount: Prisma.Decimal;
    metadata: Prisma.InputJsonObject;
  }>> {
    const active = await this.listActiveTenantAddons(tenantId);
    return active.map((addon) => ({
      type: `addon:${addon.addonKey}`,
      description: addon.billingAddon?.name ?? `Add-on ${addon.addonKey}`,
      quantity: 1,
      unitAmount: addon.price,
      totalAmount: addon.price,
      metadata: {
        addonKey: addon.addonKey,
        addonStatus: addon.status,
        billingAddonId: addon.billingAddonId,
      },
    }));
  }
}

export { AI_ADDON_KEY };
