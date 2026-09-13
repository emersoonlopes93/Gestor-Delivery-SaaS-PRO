import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FinancialStatus,
  FinancialTransactionType,
  MarketplaceProvider,
  MarketplaceSettlementStatus,
  Prisma,
} from '@prisma/client';
import type {
  Food99BillEntryDTO,
  Food99FinancialSyncResultDTO,
  Food99ReconciliationDTO,
  Food99SettlementDTO,
} from '@gestor/types';
import { PrismaService } from '../../database/prisma.service';
import { runSerializableTransactionWithRetry } from '../../database/serializable-transaction';
import { Food99ApiError } from '../providers/food99-api.error';
import {
  Food99FinancialClientService,
  Food99FinancialRecord,
  splitFood99FinancialBackfill,
} from './food99-financial-client.service';

type ParsedBillEntry = {
  orderId: string;
  orderType: 1 | 2 | 3 | 4 | 5;
  businessTs: string;
  businessAt: Date | null;
  dayPaymentId: string;
  commissionAmount: bigint;
  settlementAmount: bigint;
  orderAmount: bigint;
  shopActivityOutcome: bigint;
  shopActivitySubsidy: bigint;
  expectSettleDate: Date | null;
  rawPayload: Prisma.InputJsonValue;
};

type ParsedSettlement = {
  weekPaymentId: string;
  withdrawAmount: bigint;
  withdrawDate: Date;
  liability: bigint;
  shopId: string;
  settleStartDate: Date;
  settleEndDate: Date;
  currency: string;
  dayPaymentIds: string[];
  rawPayload: Prisma.InputJsonValue;
};

@Injectable()
export class Food99FinancialReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly client: Food99FinancialClientService,
  ) {}

  async sync(
    tenantId: string,
    input: { connectionId: string; startDate: string; endDate: string },
    correlationId: string,
  ): Promise<Food99FinancialSyncResultDTO> {
    if (typeof input.connectionId !== 'string' || !input.connectionId.trim()) {
      throw new BadRequestException('connectionId e obrigatorio para sincronizar a 99Food.');
    }
    if (typeof input.startDate !== 'string' || typeof input.endDate !== 'string') {
      throw new BadRequestException('Data inicial e final sao obrigatorias para sincronizar a 99Food.');
    }
    const connection = await this.prisma.marketplaceConnection.findFirst({
      where: {
        id: input.connectionId,
        tenantId,
        provider: MarketplaceProvider.FOOD_99,
      },
    });
    if (!connection) throw new NotFoundException('Integracao 99Food nao encontrada.');

    const windows = splitFood99FinancialBackfill(input.startDate, input.endDate);
    const result: Food99FinancialSyncResultDTO = {
      billEntriesReceived: 0,
      billEntriesCreated: 0,
      settlementsReceived: 0,
      settlementsCreated: 0,
      settlementsUpdated: 0,
      discrepanciesDetected: 0,
    };

    try {
      for (const window of windows) {
        const billRecords = await this.client.fetchBillEntries(connection, window, correlationId);
        const settlementRecords = await this.client.fetchSettlements(connection, window, correlationId);
        result.billEntriesReceived += billRecords.length;
        result.settlementsReceived += settlementRecords.length;

        for (const record of deduplicateBillRecords(billRecords)) {
          const created = await this.upsertBillEntry(tenantId, connection.id, record);
          if (created) result.billEntriesCreated += 1;
        }
        for (const record of deduplicateSettlementRecords(settlementRecords)) {
          const persisted = await this.upsertSettlement(tenantId, connection.id, record);
          if (persisted.created) result.settlementsCreated += 1;
          if (persisted.updated) result.settlementsUpdated += 1;
          if (persisted.discrepancy) result.discrepanciesDetected += 1;
        }
      }
      await this.refreshCompositionDifferences(tenantId, connection.id);
      return result;
    } catch (error) {
      if (error instanceof Food99ApiError) {
        if (error.providerCode === 'FINANCE_ACCESS_NOT_ENABLED') {
          throw new ForbiddenException({
            message: 'A integracao financeira da 99Food requer liberacao/WhiteList.',
            error: 'FINANCE_ACCESS_NOT_ENABLED',
          });
        }
        throw new BadGatewayException({
          message: error.message,
          error: error.providerCode || 'FOOD99_FINANCIAL_PROVIDER_ERROR',
        });
      }
      throw error;
    }
  }

  async configureSettlementAccount(
    tenantId: string,
    connectionId: string,
    accountId: string | null,
  ): Promise<{ connectionId: string; settlementFinancialAccountId: string | null }> {
    if (accountId !== null && (typeof accountId !== 'string' || !accountId.trim())) {
      throw new BadRequestException('accountId deve ser uma conta valida ou null.');
    }
    const connection = await this.prisma.marketplaceConnection.findFirst({
      where: { id: connectionId, tenantId, provider: MarketplaceProvider.FOOD_99 },
      select: { id: true },
    });
    if (!connection) throw new NotFoundException('Integracao 99Food nao encontrada.');

    if (accountId) {
      const account = await this.prisma.financialAccount.findFirst({
        where: { id: accountId, tenantId, active: true },
        select: { id: true },
      });
      if (!account) {
        throw new BadRequestException('A conta financeira deve estar ativa e pertencer ao tenant.');
      }
    }

    const updated = await this.prisma.marketplaceConnection.updateMany({
      where: { id: connectionId, tenantId, provider: MarketplaceProvider.FOOD_99 },
      data: { settlementFinancialAccountId: accountId },
    });
    if (updated.count !== 1) throw new ConflictException('A integracao foi alterada durante a configuracao.');
    return { connectionId, settlementFinancialAccountId: accountId };
  }

  async postSettlement(tenantId: string, settlementId: string): Promise<Food99SettlementDTO> {
    if (!settlementId.trim()) throw new BadRequestException('settlementId e obrigatorio.');
    await runSerializableTransactionWithRetry(this.prisma, async (tx) => {
      const settlement = await tx.marketplaceSettlement.findFirst({
        where: { id: settlementId, tenantId, provider: MarketplaceProvider.FOOD_99 },
        include: { connection: true },
      });
      if (!settlement) throw new NotFoundException('Repasse 99Food nao encontrado.');
      if (settlement.financialTransactionId) return;
      if (settlement.status === MarketplaceSettlementStatus.RECONCILIATION_DISCREPANCY) {
        throw new ConflictException('Repasse com divergencia do provedor requer revisao antes do registro.');
      }
      if (!settlement.weekPaymentId || !settlement.withdrawDate) {
        throw new ConflictException('Repasse sem identificador ou data de desembolso nao e elegivel.');
      }
      if (settlement.currency.toUpperCase() !== 'BRL') {
        throw new ConflictException(`Moeda ${settlement.currency} nao suportada pelo financeiro.`);
      }
      const accountId = settlement.connection.settlementFinancialAccountId;
      if (!accountId) {
        throw new ConflictException('Configure explicitamente a conta financeira de destino.');
      }
      const account = await tx.financialAccount.findFirst({
        where: { id: accountId, tenantId, active: true },
        select: { id: true },
      });
      if (!account) {
        throw new ConflictException('A conta financeira configurada esta inativa ou nao pertence ao tenant.');
      }

      const isIncome = settlement.withdrawAmount >= 0n;
      const transaction = await tx.financialTransaction.create({
        data: {
          tenantId,
          accountId,
          type: isIncome ? FinancialTransactionType.income : FinancialTransactionType.expense,
          category: 'marketplace_settlement',
          amount: centsToDecimal(absBigInt(settlement.withdrawAmount)),
          status: FinancialStatus.paid,
          paymentDate: settlement.withdrawDate,
          description: `Repasse 99Food ${settlement.weekPaymentId}`,
          referenceId: settlement.weekPaymentId,
          referenceType: 'marketplace_settlement_99food',
        },
      });

      const linked = await tx.marketplaceSettlement.updateMany({
        where: {
          id: settlement.id,
          tenantId,
          financialTransactionId: null,
          status: MarketplaceSettlementStatus.LIQUIDATED_UNPOSTED,
        },
        data: {
          financialTransactionId: transaction.id,
          postedAt: new Date(),
          status: MarketplaceSettlementStatus.POSTED,
        },
      });
      if (linked.count !== 1) {
        throw new ConflictException('O repasse foi registrado concorrentemente.');
      }

      const balance = await tx.financialAccount.updateMany({
        where: { id: accountId, tenantId, active: true },
        data: { balance: { increment: centsToDecimal(settlement.withdrawAmount) } },
      });
      if (balance.count !== 1) throw new ConflictException('A conta financeira deixou de estar disponivel.');
    }, {
      maxAttempts: 6,
      baseBackoffMs: 25,
      maxBackoffMs: 200,
      isAdditionalRetryableError: (error) => hasPrismaErrorCode(error, 'P2034'),
    });

    const view = await this.getSettlementView(tenantId, settlementId);
    if (!view) throw new NotFoundException('Repasse 99Food nao encontrado.');
    return view;
  }

  async findReconciliation(
    tenantId: string,
    filters: { connectionId?: string; startDate?: string; endDate?: string },
  ): Promise<Food99ReconciliationDTO> {
    if ((filters.startDate && !filters.endDate) || (!filters.startDate && filters.endDate)) {
      throw new BadRequestException('Informe data inicial e final juntas.');
    }
    const dateFilter = filters.startDate && filters.endDate
      ? { gte: parseProviderDate(filters.startDate, 'startDate'), lte: endOfUtcDay(parseProviderDate(filters.endDate, 'endDate')) }
      : undefined;
    const connectionWhere = {
      tenantId,
      provider: MarketplaceProvider.FOOD_99,
    };
    const [connections, settlements, billEntries] = await Promise.all([
      this.prisma.marketplaceConnection.findMany({
        where: connectionWhere,
        select: {
          id: true,
          displayName: true,
          externalStoreId: true,
          settlementFinancialAccountId: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.marketplaceSettlement.findMany({
        where: {
          tenantId,
          provider: MarketplaceProvider.FOOD_99,
          ...(filters.connectionId ? { connectionId: filters.connectionId } : {}),
          ...(dateFilter ? { withdrawDate: dateFilter } : {}),
        },
        include: { connection: true, dayPayments: true },
        orderBy: { withdrawDate: 'desc' },
        take: 200,
      }),
      this.prisma.marketplaceBillEntry.findMany({
        where: {
          tenantId,
          provider: MarketplaceProvider.FOOD_99,
          ...(filters.connectionId ? { connectionId: filters.connectionId } : {}),
          ...(dateFilter ? { businessAt: dateFilter } : {}),
        },
        orderBy: [{ businessAt: 'desc' }, { createdAt: 'desc' }],
        take: 500,
      }),
    ]);

    return {
      connections: connections.map((connection) => ({
        id: connection.id,
        displayName: connection.displayName,
        appShopId: connection.externalStoreId,
        settlementFinancialAccountId: connection.settlementFinancialAccountId,
      })),
      settlements: await Promise.all(settlements.map((settlement) => (
        this.mapSettlementView(tenantId, settlement)
      ))),
      billEntries: billEntries.map(mapBillEntry),
    };
  }

  private async upsertBillEntry(
    tenantId: string,
    connectionId: string,
    record: Food99FinancialRecord,
  ): Promise<boolean> {
    const parsed = parseBillEntry(record);
    const identity = {
      tenantId,
      provider: MarketplaceProvider.FOOD_99,
      connectionId,
      orderId: parsed.orderId,
      orderType: parsed.orderType,
      businessTs: parsed.businessTs,
    };
    const existing = await this.prisma.marketplaceBillEntry.findUnique({
      where: { tenantId_provider_connectionId_orderId_orderType_businessTs: identity },
      select: { id: true },
    });
    await this.prisma.marketplaceBillEntry.upsert({
      where: { tenantId_provider_connectionId_orderId_orderType_businessTs: identity },
      create: { ...identity, ...parsed },
      update: {
        businessAt: parsed.businessAt,
        dayPaymentId: parsed.dayPaymentId,
        commissionAmount: parsed.commissionAmount,
        settlementAmount: parsed.settlementAmount,
        orderAmount: parsed.orderAmount,
        shopActivityOutcome: parsed.shopActivityOutcome,
        shopActivitySubsidy: parsed.shopActivitySubsidy,
        expectSettleDate: parsed.expectSettleDate,
        rawPayload: parsed.rawPayload,
      },
    });
    return !existing;
  }

  private async upsertSettlement(
    tenantId: string,
    connectionId: string,
    record: Food99FinancialRecord,
    retryOnUniqueConflict = true,
  ): Promise<{ created: boolean; updated: boolean; discrepancy: boolean }> {
    const parsed = parseSettlement(record);
    try {
      return await runSerializableTransactionWithRetry(this.prisma, async (tx) => {
      const existing = await tx.marketplaceSettlement.findUnique({
        where: {
          tenantId_provider_weekPaymentId: {
            tenantId,
            provider: MarketplaceProvider.FOOD_99,
            weekPaymentId: parsed.weekPaymentId,
          },
        },
      });
      if (!existing) {
        await tx.marketplaceSettlement.create({
          data: {
            tenantId,
            provider: MarketplaceProvider.FOOD_99,
            connectionId,
            ...settlementFacts(parsed),
            dayPayments: {
              create: parsed.dayPaymentIds.map((dayPaymentId) => ({ dayPaymentId })),
            },
          },
        });
        return { created: true, updated: false, discrepancy: false };
      }

      if (existing.connectionId !== connectionId || existing.shopId !== parsed.shopId) {
        await tx.marketplaceSettlement.updateMany({
          where: { id: existing.id, tenantId },
          data: {
            status: MarketplaceSettlementStatus.RECONCILIATION_DISCREPANCY,
            discrepancyDetails: {
              reason: 'SETTLEMENT_SHOP_IDENTITY_CHANGED',
              observedConnectionId: connectionId,
              observedShopId: parsed.shopId,
            },
            rawPayload: parsed.rawPayload,
          },
        });
        return { created: false, updated: false, discrepancy: true };
      }

      const drift = materialSettlementDrift(existing, parsed);
      if (existing.financialTransactionId && drift) {
        await tx.marketplaceSettlement.updateMany({
          where: { id: existing.id, tenantId },
          data: {
            status: MarketplaceSettlementStatus.RECONCILIATION_DISCREPANCY,
            discrepancyDetails: {
              reason: 'PROVIDER_FACTS_CHANGED_AFTER_POSTING',
              observedWithdrawAmount: parsed.withdrawAmount.toString(),
              observedWithdrawDate: parsed.withdrawDate.toISOString(),
              observedCurrency: parsed.currency,
            },
            rawPayload: parsed.rawPayload,
          },
        });
        return { created: false, updated: false, discrepancy: true };
      }

      if (!existing.financialTransactionId) {
        await tx.marketplaceSettlement.update({
          where: { id: existing.id },
          data: {
            connectionId,
            ...settlementFacts(parsed),
            status: MarketplaceSettlementStatus.LIQUIDATED_UNPOSTED,
            discrepancyDetails: Prisma.JsonNull,
            dayPayments: {
              deleteMany: {},
              create: parsed.dayPaymentIds.map((dayPaymentId) => ({ dayPaymentId })),
            },
          },
        });
        return { created: false, updated: drift, discrepancy: false };
      }
      return { created: false, updated: false, discrepancy: false };
      });
    } catch (error) {
      if (retryOnUniqueConflict
        && error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === 'P2002') {
        return this.upsertSettlement(tenantId, connectionId, record, false);
      }
      throw error;
    }
  }

  private async refreshCompositionDifferences(tenantId: string, connectionId: string): Promise<void> {
    const settlements = await this.prisma.marketplaceSettlement.findMany({
      where: { tenantId, connectionId, provider: MarketplaceProvider.FOOD_99 },
      select: { id: true, withdrawAmount: true, dayPayments: { select: { dayPaymentId: true } } },
    });
    for (const settlement of settlements) {
      const dayPaymentIds = settlement.dayPayments.map((entry) => entry.dayPaymentId);
      const bills = dayPaymentIds.length === 0 ? [] : await this.prisma.marketplaceBillEntry.findMany({
        where: {
          tenantId,
          connectionId,
          provider: MarketplaceProvider.FOOD_99,
          dayPaymentId: { in: dayPaymentIds },
        },
        select: { settlementAmount: true },
      });
      const linkedTotal = bills.reduce((sum, bill) => sum + bill.settlementAmount, 0n);
      await this.prisma.marketplaceSettlement.updateMany({
        where: { id: settlement.id, tenantId },
        data: { compositionDifference: linkedTotal - settlement.withdrawAmount },
      });
    }
  }

  private async getSettlementView(tenantId: string, settlementId: string): Promise<Food99SettlementDTO | null> {
    const settlement = await this.prisma.marketplaceSettlement.findFirst({
      where: { id: settlementId, tenantId, provider: MarketplaceProvider.FOOD_99 },
      include: { connection: true, dayPayments: true },
    });
    return settlement ? this.mapSettlementView(tenantId, settlement) : null;
  }

  private async mapSettlementView(
    tenantId: string,
    settlement: Prisma.MarketplaceSettlementGetPayload<{
      include: { connection: true; dayPayments: true };
    }>,
  ): Promise<Food99SettlementDTO> {
    const dayPaymentIds = settlement.dayPayments.map((entry) => entry.dayPaymentId);
    const bills = dayPaymentIds.length === 0 ? [] : await this.prisma.marketplaceBillEntry.findMany({
      where: {
        tenantId,
        connectionId: settlement.connectionId,
        provider: MarketplaceProvider.FOOD_99,
        dayPaymentId: { in: dayPaymentIds },
      },
      select: { settlementAmount: true },
    });
    const linkedTotal = bills.reduce((sum, bill) => sum + bill.settlementAmount, 0n);
    const difference = linkedTotal - settlement.withdrawAmount;
    return {
      id: settlement.id,
      connectionId: settlement.connectionId,
      connectionName: settlement.connection.displayName,
      weekPaymentId: settlement.weekPaymentId,
      withdrawAmountCents: settlement.withdrawAmount.toString(),
      withdrawDate: settlement.withdrawDate.toISOString(),
      liabilityCents: settlement.liability.toString(),
      shopId: settlement.shopId,
      settleStartDate: settlement.settleStartDate.toISOString(),
      settleEndDate: settlement.settleEndDate.toISOString(),
      currency: settlement.currency,
      status: settlement.status,
      financialTransactionId: settlement.financialTransactionId,
      postedAt: settlement.postedAt?.toISOString() ?? null,
      dayPaymentIds,
      linkedBillEntryCount: bills.length,
      linkedSettlementAmountCents: linkedTotal.toString(),
      compositionDifferenceCents: difference.toString(),
      hasCompositionDiscrepancy: difference !== 0n,
    };
  }
}

function parseBillEntry(record: Food99FinancialRecord): ParsedBillEntry {
  const orderType = requiredInteger(record, 'orderType');
  if (![1, 2, 3, 4, 5].includes(orderType)) {
    throw new BadGatewayException(`99Food returned unsupported orderType ${orderType}.`);
  }
  const businessTs = requiredLosslessString(record, 'businessTs');
  return {
    orderId: requiredLosslessString(record, 'orderId'),
    orderType: orderType as 1 | 2 | 3 | 4 | 5,
    businessTs,
    businessAt: parseOptionalTimestamp(businessTs),
    dayPaymentId: requiredLosslessString(record, 'dayPaymentId'),
    commissionAmount: requiredCents(record, 'commissionAmount'),
    settlementAmount: requiredCents(record, 'settlementAmount'),
    orderAmount: requiredCents(record, 'orderAmount'),
    shopActivityOutcome: requiredCents(record, 'shopActivityOutcome'),
    shopActivitySubsidy: requiredCents(record, 'shopActivitySubsidy'),
    expectSettleDate: optionalProviderDate(record.expectSettleDate, 'expectSettleDate'),
    rawPayload: record as Prisma.InputJsonValue,
  };
}

function parseSettlement(record: Food99FinancialRecord): ParsedSettlement {
  const dayPaymentList = record.dayPaymentIDList;
  if (!Array.isArray(dayPaymentList)) {
    throw new BadGatewayException('99Food settlement dayPaymentIDList is invalid.');
  }
  const dayPaymentIds = [...new Set(dayPaymentList.map((value) => losslessValue(value, 'dayPaymentIDList')))];
  return {
    weekPaymentId: requiredLosslessString(record, 'weekPaymentId'),
    withdrawAmount: requiredCents(record, 'withdrawAmount'),
    withdrawDate: requiredProviderDate(record.withdrawDate, 'withdrawDate'),
    liability: requiredCents(record, 'liability'),
    shopId: requiredLosslessString(record, 'shopId'),
    settleStartDate: requiredProviderDate(record.settleStartDate, 'settleStartDate'),
    settleEndDate: requiredProviderDate(record.settleEndDate, 'settleEndDate'),
    currency: requiredText(record, 'currency').toUpperCase(),
    dayPaymentIds,
    rawPayload: record as Prisma.InputJsonValue,
  };
}

function settlementFacts(parsed: ParsedSettlement) {
  return {
    weekPaymentId: parsed.weekPaymentId,
    withdrawAmount: parsed.withdrawAmount,
    withdrawDate: parsed.withdrawDate,
    liability: parsed.liability,
    shopId: parsed.shopId,
    settleStartDate: parsed.settleStartDate,
    settleEndDate: parsed.settleEndDate,
    currency: parsed.currency,
    rawPayload: parsed.rawPayload,
  };
}

function materialSettlementDrift(
  existing: { withdrawAmount: bigint; withdrawDate: Date; currency: string },
  incoming: ParsedSettlement,
): boolean {
  return existing.withdrawAmount !== incoming.withdrawAmount
    || existing.withdrawDate.getTime() !== incoming.withdrawDate.getTime()
    || existing.currency !== incoming.currency;
}

function deduplicateBillRecords(records: Food99FinancialRecord[]): Food99FinancialRecord[] {
  const unique = new Map<string, Food99FinancialRecord>();
  for (const record of records) {
    const key = [
      requiredLosslessString(record, 'orderId'),
      requiredInteger(record, 'orderType'),
      requiredLosslessString(record, 'businessTs'),
    ].join(':');
    unique.set(key, record);
  }
  return [...unique.values()];
}

function deduplicateSettlementRecords(records: Food99FinancialRecord[]): Food99FinancialRecord[] {
  const unique = new Map<string, Food99FinancialRecord>();
  for (const record of records) unique.set(requiredLosslessString(record, 'weekPaymentId'), record);
  return [...unique.values()];
}

function requiredLosslessString(record: Food99FinancialRecord, field: string): string {
  return losslessValue(record[field], field);
}

function losslessValue(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadGatewayException(`99Food field ${field} must be a lossless string.`);
  }
  return value;
}

function requiredText(record: Food99FinancialRecord, field: string): string {
  const value = record[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadGatewayException(`99Food field ${field} is required.`);
  }
  return value.trim();
}

function requiredInteger(record: Food99FinancialRecord, field: string): number {
  const value = record[field];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new BadGatewayException(`99Food field ${field} must be an integer.`);
  }
  return value;
}

function requiredCents(record: Food99FinancialRecord, field: string): bigint {
  const value = record[field];
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) {
    throw new BadGatewayException(`99Food money field ${field} must be integer cents.`);
  }
  return BigInt(value);
}

function parseOptionalTimestamp(value: string): Date | null {
  if (/^\d{10}$/.test(value)) return new Date(Number(value) * 1000);
  if (/^\d{13}$/.test(value)) return new Date(Number(value));
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function optionalProviderDate(value: unknown, field: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  return requiredProviderDate(value, field);
}

function requiredProviderDate(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadGatewayException(`99Food date field ${field} is required.`);
  }
  return parseProviderDate(value, field);
}

function parseProviderDate(value: string, field: string): Date {
  const normalized = /^\d{8}$/.test(value)
    ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00.000Z`
    : /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T00:00:00.000Z`
      : value;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadGatewayException(`99Food date field ${field} is invalid.`);
  }
  return parsed;
}

function mapBillEntry(entry: {
  id: string;
  orderId: string;
  orderType: number;
  businessTs: string;
  businessAt: Date | null;
  dayPaymentId: string;
  commissionAmount: bigint;
  settlementAmount: bigint;
  orderAmount: bigint;
  shopActivityOutcome: bigint;
  shopActivitySubsidy: bigint;
  expectSettleDate: Date | null;
}): Food99BillEntryDTO {
  return {
    id: entry.id,
    orderId: entry.orderId,
    orderType: entry.orderType as 1 | 2 | 3 | 4 | 5,
    businessTs: entry.businessTs,
    businessAt: entry.businessAt?.toISOString() ?? null,
    dayPaymentId: entry.dayPaymentId,
    commissionAmountCents: entry.commissionAmount.toString(),
    settlementAmountCents: entry.settlementAmount.toString(),
    orderAmountCents: entry.orderAmount.toString(),
    shopActivityOutcomeCents: entry.shopActivityOutcome.toString(),
    shopActivitySubsidyCents: entry.shopActivitySubsidy.toString(),
    expectSettleDate: entry.expectSettleDate?.toISOString() ?? null,
  };
}

function centsToDecimal(cents: bigint): Prisma.Decimal {
  const sign = cents < 0n ? '-' : '';
  const absolute = absBigInt(cents);
  const whole = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, '0');
  return new Prisma.Decimal(`${sign}${whole.toString()}.${fraction}`);
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function endOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate(),
    23,
    59,
    59,
    999,
  ));
}

function hasPrismaErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === code;
}
