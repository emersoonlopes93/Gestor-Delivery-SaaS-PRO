import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { 
  FinancialTransactionDTO, 
  CreateFinancialTransactionDTO, 
  UpdateFinancialTransactionDTO,
  FinancialStatus,
  FinancialTransactionType
} from '@gestor/types';

@Injectable()
export class FinancialTransactionsService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string, filters?: any): Promise<FinancialTransactionDTO[]> {
    const transactions = await this.prisma.financialTransaction.findMany({
      where: { 
        tenantId,
        ...(filters?.accountId ? { accountId: filters.accountId } : {}),
        ...(filters?.type ? { type: filters.type } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
      },
      include: {
        account: true
      },
      orderBy: { createdAt: 'desc' },
    });

    return transactions.map(t => this.mapToDTO(t));
  }

  async create(tenantId: string, dto: CreateFinancialTransactionDTO): Promise<FinancialTransactionDTO> {
    return this.prisma.$transaction(async (tx) => {
      const transaction = await tx.financialTransaction.create({
        data: {
          tenantId,
          ...dto,
        },
        include: {
          account: true
        }
      });

      // If transition is created as PAID and has an account, update account balance
      if (transaction.status === FinancialStatus.PAID && transaction.accountId) {
        const multiplier = transaction.type === FinancialTransactionType.INCOME ? 1 : -1;
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

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.financialTransaction.update({
        where: { id },
        data: dto,
        include: {
          account: true
        }
      });

      // If status changed to PAID, update balance
      if (existing.status !== FinancialStatus.PAID && updated.status === FinancialStatus.PAID && updated.accountId) {
        const multiplier = updated.type === FinancialTransactionType.INCOME ? 1 : -1;
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

  private mapToDTO(t: any): FinancialTransactionDTO {
    return {
      ...t,
      amount: Number(t.amount),
      accountName: t.account?.name
    };
  }
}
