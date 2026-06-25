import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { BillingRevenueTier, Invoice, Prisma } from '@prisma/client';
import { BillingRatingService } from './billing-rating.service';
import { BillingAddonService } from './billing-addon.service';

export type DraftInvoiceItemPreview = {
  type: string;
  description: string;
  quantity: number;
  unitAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  metadata: Prisma.InputJsonObject;
};

@Injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billingRatingService: BillingRatingService,
    private readonly billingAddonService: BillingAddonService,
  ) {}

  async getInvoiceById(invoiceId: string): Promise<Invoice | null> {
    return this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
  }

  async listInvoicesForTenant(tenantId: string): Promise<Invoice[]> {
    return this.prisma.invoice.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createInvoiceDraft(data: Prisma.InvoiceCreateInput): Promise<Invoice> {
    return this.prisma.invoice.create({ data });
  }

  async createDraftInvoiceForCycle(input: {
    tenantId: string;
    subscriptionId: string;
    cycleId: string;
    planId: string;
    usageSnapshotId?: string;
    tx?: Prisma.TransactionClient;
  }): Promise<Invoice> {
    return this.getOrCreateDraftInvoiceForCycle(input);
  }

  async getOrCreateDraftInvoiceForCycle(input: {
    tenantId: string;
    subscriptionId: string;
    cycleId: string;
    planId: string;
    usageSnapshotId?: string;
    tx?: Prisma.TransactionClient;
  }): Promise<Invoice> {
    const client = input.tx ?? this.prisma;
    const existing = await client.invoice.findFirst({
      where: {
        tenantId: input.tenantId,
        subscriptionId: input.subscriptionId,
        cycleId: input.cycleId,
      },
    });

    if (existing) {
      await this.ensureDraftInvoiceItems({
        invoiceId: existing.id,
        cycleId: input.cycleId,
        planId: input.planId,
        tx: client,
      });
      return existing;
    }

    const cycle = await client.billingCycleRecord.findFirst({
      where: {
        id: input.cycleId,
        tenantId: input.tenantId,
        subscriptionId: input.subscriptionId,
      },
    });
    if (!cycle) {
      throw new NotFoundException('Ciclo de billing não encontrado.');
    }

    const usageSnapshot = input.usageSnapshotId
      ? await client.billingUsageSnapshot.findFirst({
          where: {
            id: input.usageSnapshotId,
            tenantId: input.tenantId,
            cycleId: input.cycleId,
          },
          select: { id: true, billingRuleVersionId: true },
        })
      : null;

    const invoice = await client.invoice.create({
      data: {
        tenantId: input.tenantId,
        subscriptionId: input.subscriptionId,
        cycleId: input.cycleId,
        usageSnapshotId: usageSnapshot?.id ?? null,
        billingRuleVersionId: usageSnapshot?.billingRuleVersionId ?? null,
        number: this.buildInvoiceNumber(input.tenantId, input.cycleId),
        status: 'draft',
        subtotal: cycle.totalAmount,
        discountTotal: new Prisma.Decimal(0),
        taxTotal: new Prisma.Decimal(0),
        total: cycle.totalAmount,
        currency: cycle.currency,
        dueDate: this.resolveDueDate(cycle.endedAt ?? new Date()),
        provider: 'manual',
      },
    });

    await this.ensureDraftInvoiceItems({
      invoiceId: invoice.id,
      cycleId: input.cycleId,
      planId: input.planId,
      tx: client,
    });

    await client.billingCycleRecord.update({
      where: { id: input.cycleId },
      data: { status: 'invoiced' },
    });

    return invoice;
  }

  async buildDraftInvoiceItemsPreview(input: {
    tenantId: string;
    planId: string;
    periodStart: Date;
    periodEnd: Date;
    measuredRevenue: Prisma.Decimal;
    billableRevenue: Prisma.Decimal;
    baseAmount: Prisma.Decimal;
    selectedTier: BillingRevenueTier | null;
  }): Promise<DraftInvoiceItemPreview[]> {
    const tier = input.selectedTier
      ?? await this.billingRatingService.selectRevenueTier(input.planId, input.billableRevenue);
    const tierLabel = tier?.label ?? 'Sem faixa';
    const tierId = tier?.id ?? null;

    const items: DraftInvoiceItemPreview[] = [
      {
        type: 'revenue_tier_base',
        description: `Mensalidade por faturamento - faixa ${tierLabel}`,
        quantity: 1,
        unitAmount: input.baseAmount,
        totalAmount: input.baseAmount,
        metadata: {
          measuredRevenue: input.measuredRevenue.toFixed(2),
          billableRevenue: input.billableRevenue.toFixed(2),
          tierId,
          tierLabel,
          periodStart: input.periodStart.toISOString(),
          periodEnd: input.periodEnd.toISOString(),
        },
      },
    ];

    const addonItems = await this.billingAddonService.buildAddonInvoiceItems(input.tenantId);
    return [
      ...items,
      ...addonItems,
    ];
  }

  private async ensureDraftInvoiceItems(input: {
    invoiceId: string;
    cycleId: string;
    planId: string;
    tx: Prisma.TransactionClient;
  }): Promise<void> {
    const cycle = await input.tx.billingCycleRecord.findUnique({
      where: { id: input.cycleId },
      include: { selectedTier: true },
    });
    if (!cycle) {
      throw new NotFoundException('Ciclo de billing não encontrado.');
    }

    const items = await this.buildDraftInvoiceItemsPreview({
      tenantId: cycle.tenantId,
      planId: input.planId,
      periodStart: cycle.startedAt,
      periodEnd: cycle.endedAt ?? cycle.startedAt,
      measuredRevenue: cycle.measuredRevenue,
      billableRevenue: cycle.billableRevenue,
      baseAmount: cycle.baseAmount,
      selectedTier: cycle.selectedTier,
    });

    for (const item of items) {
      await input.tx.invoiceItem.upsert({
        where: {
          invoiceId_type: {
            invoiceId: input.invoiceId,
            type: item.type,
          },
        },
        update: {
          description: item.description,
          quantity: item.quantity,
          unitAmount: item.unitAmount,
          totalAmount: item.totalAmount,
          metadata: item.metadata,
        },
        create: {
          invoiceId: input.invoiceId,
          type: item.type,
          description: item.description,
          quantity: item.quantity,
          unitAmount: item.unitAmount,
          totalAmount: item.totalAmount,
          metadata: item.metadata,
        },
      });
    }
  }

  private buildInvoiceNumber(tenantId: string, cycleId: string): string {
    return `INV-${tenantId.slice(0, 8).toUpperCase()}-${cycleId.slice(0, 8).toUpperCase()}`;
  }

  private resolveDueDate(periodEnd: Date): Date {
    const dueDate = new Date(periodEnd);
    dueDate.setUTCDate(dueDate.getUTCDate() + 7);
    return dueDate;
  }
}
