import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { 
  FinancialTransactionDTO, 
  CreateFinancialTransactionDTO, 
  UpdateFinancialTransactionDTO,
  FinancialStatus,
  FinancialTransactionType
} from '@gestor/types';
import { FinancialStatus as PrismaFinancialStatus, FinancialTransactionType as PrismaFinancialTransactionType, Prisma } from '@prisma/client';

@Injectable()
export class FinancialTransactionsService {
  constructor(private prisma: PrismaService) {}

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
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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

      // If transition is created as PAID and has an account, update account balance
      if (transaction.status === PrismaFinancialStatus.paid && transaction.accountId) {
        const multiplier = transaction.type === PrismaFinancialTransactionType.income ? 1 : -1;
        await tx.financialAccount.update({
          where: { id: transaction.accountId },
          data: {
            balance: {
              increment: Number(transaction.amount) * multiplier
            }
          }
        });
      }

      return this.mapToDTO(transaction);
    });
  }

  async update(tenantId: string, id: string, dto: UpdateFinancialTransactionDTO): Promise<FinancialTransactionDTO> {
    const existing = await this.prisma.financialTransaction.findFirst({
      where: { id, tenantId }
    });

    if (!existing) throw new NotFoundException('Transação não encontrada');

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updated = await tx.financialTransaction.update({
        where: { id },
        data: {
          ...(dto.status && { status: this.toPrismaStatus(dto.status) }),
          ...(dto.paymentDate && { paymentDate: dto.paymentDate }),
          ...(dto.description && { description: dto.description }),
          ...(dto.amount !== undefined && { amount: dto.amount }),
        },
        include: {
          account: true
        }
      });

      // If status changed to PAID, update balance
      if (existing.status !== PrismaFinancialStatus.paid && updated.status === PrismaFinancialStatus.paid && updated.accountId) {
        const multiplier = updated.type === PrismaFinancialTransactionType.income ? 1 : -1;
        await tx.financialAccount.update({
          where: { id: updated.accountId },
          data: {
            balance: {
              increment: Number(updated.amount) * multiplier
            }
          }
        });
      }

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
