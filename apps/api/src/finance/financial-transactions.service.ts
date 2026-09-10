import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { 
  FinancialTransactionDTO, 
  CreateFinancialTransactionDTO, 
  UpdateFinancialTransactionDTO,
  FinancialStatus,
  FinancialTransactionType
} from '@gestor/types';
import { FinancialStatus as PrismaFinancialStatus, FinancialTransactionType as PrismaFinancialTransactionType, Prisma } from '@prisma/client';
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

  async findAll(
    tenantId: string,
    filters?: { accountId?: string; type?: FinancialTransactionType; status?: FinancialStatus },
  ): Promise<FinancialTransactionDTO[]> {
    const transactions = await this.prisma.financialTransaction.findMany({
      where: { 
        tenantId,
        ...(filters?.accountId ? { accountId: filters.accountId } : {}),
        ...(filters?.type ? { type: this.toPrismaType(filters.type) } : {}),
        ...(filters?.status ? { status: this.toPrismaStatus(filters.status) } : {}),
      },
      include: {
        account: true
      },
      orderBy: { createdAt: 'desc' },
    });

    return transactions.map(t => this.mapToDTO(t));
  }

  async create(tenantId: string, dto: CreateFinancialTransactionDTO): Promise<FinancialTransactionDTO> {
    if (dto.referenceType === 'purchase' || dto.referenceType === 'purchase_reversal') {
      throw new ConflictException('Lancamentos de compra devem ser gerenciados pelo lifecycle de compras.');
    }
    if (dto.accountId) {
      const account = await this.prisma.financialAccount.findFirst({
        where: { id: dto.accountId, tenantId },
        select: { id: true },
      });
      if (!account) throw new NotFoundException('Conta financeira nÃ£o encontrada');
    }

    return runSerializableTransactionWithRetry(this.prisma, async (tx) => {
      const transaction = await tx.financialTransaction.create({
        data: {
          tenantId,
          accountId: dto.accountId,
          type: this.toPrismaType(dto.type),
          category: dto.category,
          amount: dto.amount,
          status: dto.status ? this.toPrismaStatus(dto.status) : PrismaFinancialStatus.pending,
          dueDate: dto.dueDate,
          paymentDate: dto.paymentDate,
          description: dto.description,
          referenceId: dto.referenceId,
          referenceType: dto.referenceType,
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
      if (current.referenceType === 'purchase' || current.referenceType === 'purchase_reversal') {
        throw new ConflictException('Lancamento de compra e imutavel fora do lifecycle de compras.');
      }

      if (dto.accountId !== undefined) {
        await this.ensureAccountBelongsToTenant(tx, tenantId, dto.accountId);
      }

      const result = await tx.financialTransaction.updateMany({
        where: { id, tenantId },
        data: {
          ...(dto.accountId !== undefined && { accountId: dto.accountId }),
          ...(dto.status !== undefined && { status: this.toPrismaStatus(dto.status) }),
          ...(dto.paymentDate !== undefined && { paymentDate: dto.paymentDate }),
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
}
