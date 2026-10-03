import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { 
  FinancialTransactionDTO, 
  CreateFinancialTransactionDTO, 
  UpdateFinancialTransactionDTO,
  FinancialStatus,
  FinancialTransactionType
} from '@gestor/types';
import { FinancialStatus as PrismaFinancialStatus, FinancialTransactionType as PrismaFinancialTransactionType, MarketplaceProvider, MarketplaceSettlementStatus, OrderStatus, Prisma } from '@prisma/client';
import { runSerializableTransactionWithRetry } from '../database/serializable-transaction';

@Injectable()
export class FinancialTransactionsService {
  constructor(private prisma: PrismaService) {}

  private getAccountBalanceEffect(transaction: {
    accountId: string | null;
    amount: Prisma.Decimal | number;
    status: PrismaFinancialStatus;
    type: PrismaFinancialTransactionType;
  }): { accountId: string; amount: number } | null {
    if (transaction.status !== PrismaFinancialStatus.paid || !transaction.accountId) {
      return null;
    }

    const multiplier = transaction.type === PrismaFinancialTransactionType.income ? 1 : -1;
    return { accountId: transaction.accountId, amount: Number(transaction.amount) * multiplier };
  }

  private async ensureAccountBelongsToTenant(
    tx: Prisma.TransactionClient,
    tenantId: string,
    accountId: string,
  ): Promise<void> {
    const account = await tx.financialAccount.findFirst({
      where: { id: accountId, tenantId },
      select: { id: true },
    });
    if (!account) throw new NotFoundException('Conta financeira não encontrada');
  }

  private async applyAccountBalanceEffect(
    tx: Prisma.TransactionClient,
    tenantId: string,
    effect: { accountId: string; amount: number } | null,
  ): Promise<void> {
    if (!effect || effect.amount === 0) return;

    const updated = await tx.financialAccount.updateMany({
      where: { id: effect.accountId, tenantId },
      data: { balance: { increment: effect.amount } },
    });
    if (updated.count !== 1) {
      throw new NotFoundException('Conta financeira não encontrada');
    }
  }

  private toPrismaType(type: FinancialTransactionType): PrismaFinancialTransactionType {
    switch (type) {
      case FinancialTransactionType.INCOME:
        return PrismaFinancialTransactionType.income;
      case FinancialTransactionType.EXPENSE:
        return PrismaFinancialTransactionType.expense;
    }
  }

  private toDtoType(type: PrismaFinancialTransactionType): FinancialTransactionType {
    switch (type) {
      case PrismaFinancialTransactionType.income:
        return FinancialTransactionType.INCOME;
      case PrismaFinancialTransactionType.expense:
        return FinancialTransactionType.EXPENSE;
    }
  }

  private toPrismaStatus(status: FinancialStatus): PrismaFinancialStatus {
    switch (status) {
      case FinancialStatus.PENDING:
        return PrismaFinancialStatus.pending;
      case FinancialStatus.PAID:
        return PrismaFinancialStatus.paid;
      case FinancialStatus.CANCELLED:
        return PrismaFinancialStatus.cancelled;
      case FinancialStatus.OVERDUE:
        return PrismaFinancialStatus.overdue;
    }
  }

  private toDtoStatus(status: PrismaFinancialStatus): FinancialStatus {
    switch (status) {
      case PrismaFinancialStatus.pending:
        return FinancialStatus.PENDING;
      case PrismaFinancialStatus.paid:
        return FinancialStatus.PAID;
      case PrismaFinancialStatus.cancelled:
        return FinancialStatus.CANCELLED;
      case PrismaFinancialStatus.overdue:
        return FinancialStatus.OVERDUE;
    }
  }

  private normalizePaymentDate(status: PrismaFinancialStatus, paymentDate: Date | string | undefined): Date | null {
    if (status !== PrismaFinancialStatus.paid) return null;
    if (paymentDate === undefined) return new Date();
    const normalized = paymentDate instanceof Date ? paymentDate : new Date(paymentDate);
    if (Number.isNaN(normalized.getTime())) {
      throw new BadRequestException('Informe uma data de pagamento válida.');
    }
    return normalized;
  }

  private normalizeIdempotencyKey(key: string | undefined): string | undefined {
    if (key === undefined) return undefined;
    const normalized = key.trim();
    if (!normalized || normalized.length > 120) {
      throw new BadRequestException('A identificação da operação é inválida.');
    }
    return normalized;
  }

  async findAll(
    tenantId: string,
    filters?: { accountId?: string; type?: FinancialTransactionType; status?: FinancialStatus; startDate?: Date; endDate?: Date },
  ): Promise<FinancialTransactionDTO[]> {
    const transactions = await this.prisma.financialTransaction.findMany({
      where: { 
        tenantId,
        ...(filters?.accountId ? { accountId: filters.accountId } : {}),
        ...(filters?.type ? { type: this.toPrismaType(filters.type) } : {}),
        ...(filters?.status ? { status: this.toPrismaStatus(filters.status) } : {}),
        ...(filters?.startDate || filters?.endDate ? { createdAt: { ...(filters.startDate ? { gte: filters.startDate } : {}), ...(filters.endDate ? { lte: filters.endDate } : {}) } } : {}),
      },
      include: {
        account: true
      },
      orderBy: { createdAt: 'desc' },
    });

    return transactions.map(t => this.mapToDTO(t));
  }

  /**
   * Financial read model deliberately keeps commercial sales, recorded receipts,
   * account balances and provider settlements separate. It is available to
   * finance.read users and does not depend on reports.read.
   */
  async getSummary(tenantId: string, startDate?: Date, endDate?: Date) {
    const createdAt = startDate || endDate
      ? { ...(startDate ? { gte: startDate } : {}), ...(endDate ? { lte: endDate } : {}) }
      : undefined;
    const paymentDate = createdAt;
    const dueDate = createdAt;
    const now = new Date();
    const [completedSales, paidIncome, paidExpenses, accountBalances, pendingPayables, overduePayables, food99Receivable, food99Posted, food99Divergences, paidWithoutPaymentDate] = await Promise.all([
      this.prisma.order.aggregate({ where: { tenantId, status: OrderStatus.completed, ...(createdAt ? { createdAt } : {}) }, _sum: { total: true } }),
      this.prisma.financialTransaction.aggregate({ where: { tenantId, status: PrismaFinancialStatus.paid, type: PrismaFinancialTransactionType.income, ...(paymentDate ? { paymentDate } : {}) }, _sum: { amount: true } }),
      this.prisma.financialTransaction.aggregate({ where: { tenantId, status: PrismaFinancialStatus.paid, type: PrismaFinancialTransactionType.expense, ...(paymentDate ? { paymentDate } : {}) }, _sum: { amount: true } }),
      this.prisma.financialAccount.aggregate({ where: { tenantId, active: true }, _sum: { balance: true } }),
      this.prisma.financialTransaction.aggregate({ where: { tenantId, type: PrismaFinancialTransactionType.expense, status: PrismaFinancialStatus.pending, ...(dueDate ? { dueDate } : {}), AND: [{ OR: [{ dueDate: null }, { dueDate: { gte: now } }] }] }, _sum: { amount: true }, _count: true }),
      this.prisma.financialTransaction.aggregate({ where: { tenantId, type: PrismaFinancialTransactionType.expense, ...(dueDate ? { dueDate } : {}), OR: [{ status: PrismaFinancialStatus.overdue }, { status: PrismaFinancialStatus.pending, dueDate: { lt: now } }] }, _sum: { amount: true }, _count: true }),
      this.prisma.marketplaceSettlement.aggregate({ where: { tenantId, provider: MarketplaceProvider.FOOD_99, status: MarketplaceSettlementStatus.LIQUIDATED_UNPOSTED, ...(createdAt ? { withdrawDate: createdAt } : {}) }, _sum: { withdrawAmount: true }, _count: true }),
      this.prisma.marketplaceSettlement.aggregate({ where: { tenantId, provider: MarketplaceProvider.FOOD_99, status: MarketplaceSettlementStatus.POSTED, ...(createdAt ? { withdrawDate: createdAt } : {}) }, _sum: { withdrawAmount: true }, _count: true }),
      this.prisma.marketplaceSettlement.count({ where: { tenantId, provider: MarketplaceProvider.FOOD_99, status: MarketplaceSettlementStatus.RECONCILIATION_DISCREPANCY, ...(createdAt ? { withdrawDate: createdAt } : {}) } }),
      this.prisma.financialTransaction.count({ where: { tenantId, status: PrismaFinancialStatus.paid, paymentDate: null } }),
    ]);

    return {
      period: { startDate: startDate?.toISOString() ?? null, endDate: endDate?.toISOString() ?? null },
      completedSales: Number(completedSales._sum.total ?? 0),
      recordedReceipts: Number(paidIncome._sum.amount ?? 0),
      recordedPayments: Number(paidExpenses._sum.amount ?? 0),
      currentAccountsBalance: Number(accountBalances._sum.balance ?? 0),
      payables: {
        pending: Number(pendingPayables._sum.amount ?? 0),
        pendingCount: pendingPayables._count,
        overdue: Number(overduePayables._sum.amount ?? 0),
        overdueCount: overduePayables._count,
      },
      food99: {
        documentedReceivable: Number(food99Receivable._sum.withdrawAmount ?? 0) / 100,
        documentedReceivableCount: food99Receivable._count,
        received: Number(food99Posted._sum.withdrawAmount ?? 0) / 100,
        receivedCount: food99Posted._count,
        discrepancyCount: food99Divergences,
      },
      dataQuality: { paidWithoutPaymentDate },
      notes: {
        accountsBalance: 'Saldo atual das contas; não depende do período selecionado.',
        posCash: 'O caixa operacional do PDV é acompanhado separadamente e não é somado ao saldo das contas.',
        food99: 'Somente repasses 99Food importados e conciliados aparecem aqui. iFood não possui repasse financeiro comprovado neste painel.',
      },
    };
  }

  async create(tenantId: string, dto: CreateFinancialTransactionDTO): Promise<FinancialTransactionDTO> {
    if (this.isLifecycleManagedReference(dto.referenceType)) {
      throw new ConflictException('Lancamentos vinculados devem ser gerenciados pelo lifecycle de origem.');
    }
    const status = dto.status ? this.toPrismaStatus(dto.status) : PrismaFinancialStatus.pending;
    const paymentDate = this.normalizePaymentDate(status, dto.paymentDate);
    const idempotencyKey = this.normalizeIdempotencyKey(dto.idempotencyKey);
    if (status === PrismaFinancialStatus.paid && !dto.accountId) {
      throw new BadRequestException('Selecione a conta em que o valor foi recebido ou pago.');
    }
    if (dto.accountId) {
      const account = await this.prisma.financialAccount.findFirst({
        where: { id: dto.accountId, tenantId },
        select: { id: true },
      });
      if (!account) throw new NotFoundException('Conta financeira nÃ£o encontrada');
    }

    try {
      return await runSerializableTransactionWithRetry(this.prisma, async (tx) => {
      if (idempotencyKey) {
        const existing = await tx.financialTransaction.findFirst({
          where: { tenantId, idempotencyKey }, include: { account: true },
        });
        if (existing) return this.mapToDTO(existing);
      }
      const transaction = await tx.financialTransaction.create({
        data: {
          tenantId,
          accountId: dto.accountId,
          type: this.toPrismaType(dto.type),
          category: dto.category,
          amount: dto.amount,
          status,
          dueDate: dto.dueDate,
          paymentDate,
          description: dto.description,
          referenceId: dto.referenceId,
          referenceType: dto.referenceType,
          idempotencyKey,
        },
        include: {
          account: true
        }
      });

      await this.applyAccountBalanceEffect(
        tx,
        tenantId,
        this.getAccountBalanceEffect(transaction),
      );

        return this.mapToDTO(transaction);
      });
    } catch (error) {
      if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.financialTransaction.findFirst({
          where: { tenantId, idempotencyKey }, include: { account: true },
        });
        if (existing) return this.mapToDTO(existing);
      }
      throw error;
    }
  }

  async update(tenantId: string, id: string, dto: UpdateFinancialTransactionDTO): Promise<FinancialTransactionDTO> {
    const existing = await this.prisma.financialTransaction.findFirst({
      where: { id, tenantId }
    });

    if (!existing) throw new NotFoundException('Transação não encontrada');

    return runSerializableTransactionWithRetry(this.prisma, async (tx) => {
      const current = await tx.financialTransaction.findFirst({
        where: { id, tenantId },
      });
      if (!current) throw new NotFoundException('Financial transaction not found');
      if (this.isLifecycleManagedReference(current.referenceType)) {
        throw new ConflictException('Lancamento vinculado e imutavel fora do lifecycle de origem.');
      }

      const requestedStatus = dto.status === undefined ? current.status : this.toPrismaStatus(dto.status);
      if (current.status === PrismaFinancialStatus.cancelled) {
        throw new ConflictException('Um lançamento cancelado não pode ser alterado. Crie um novo lançamento se necessário.');
      }
      if (current.status === PrismaFinancialStatus.paid && requestedStatus !== PrismaFinancialStatus.paid) {
        throw new ConflictException('Um lançamento pago não pode ser cancelado ou reaberto. Registre um estorno separado.');
      }
      if (current.status === PrismaFinancialStatus.paid && (dto.amount !== undefined || dto.accountId !== undefined)) {
        throw new ConflictException('O valor ou a conta de um lançamento pago não podem ser alterados. Registre um ajuste separado.');
      }
      const nextAccountId = dto.accountId === undefined ? current.accountId : dto.accountId;
      if (requestedStatus === PrismaFinancialStatus.paid && !nextAccountId) {
        throw new BadRequestException('Selecione a conta em que o valor foi recebido ou pago.');
      }

      if (dto.accountId !== undefined) {
        await this.ensureAccountBelongsToTenant(tx, tenantId, dto.accountId);
      }

      const result = await tx.financialTransaction.updateMany({
        where: { id, tenantId },
        data: {
          ...(dto.accountId !== undefined && { accountId: dto.accountId }),
          ...(dto.status !== undefined && { status: requestedStatus }),
          ...(requestedStatus === PrismaFinancialStatus.paid && { paymentDate: this.normalizePaymentDate(requestedStatus, dto.paymentDate === undefined ? current.paymentDate ?? undefined : dto.paymentDate) }),
          ...(requestedStatus !== PrismaFinancialStatus.paid && { paymentDate: null }),
          ...(dto.description !== undefined && { description: dto.description }),
          ...(dto.amount !== undefined && { amount: dto.amount }),
        },
      });
      if (result.count !== 1) {
        throw new ConflictException('Financial transaction changed during update');
      }

      const updated = await tx.financialTransaction.findFirst({
        where: { id, tenantId },
        include: { account: true },
      });
      if (!updated) throw new NotFoundException('TransaÃ§Ã£o nÃ£o encontrada');

      const previousEffect = this.getAccountBalanceEffect(current);
      const nextEffect = this.getAccountBalanceEffect(updated);
      await this.applyAccountBalanceEffect(
        tx,
        tenantId,
        previousEffect ? { ...previousEffect, amount: -previousEffect.amount } : null,
      );
      await this.applyAccountBalanceEffect(tx, tenantId, nextEffect);

      return this.mapToDTO(updated);
    });
  }

  private mapToDTO(
    t: Prisma.FinancialTransactionGetPayload<{ include: { account: true } }>,
  ): FinancialTransactionDTO {
    return {
      ...t,
      type: this.toDtoType(t.type),
      status: this.toDtoStatus(t.status),
      amount: Number(t.amount),
      accountName: t.account?.name
    };
  }

  private isLifecycleManagedReference(referenceType: string | null | undefined): boolean {
    return referenceType === 'purchase'
      || referenceType === 'purchase_reversal'
      || referenceType === 'marketplace_settlement_99food';
  }
}
