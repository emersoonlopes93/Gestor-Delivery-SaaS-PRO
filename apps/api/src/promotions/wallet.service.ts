import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WalletTransactionType } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CashbackService } from './cashback.service';

@Injectable()
export class WalletService {
  constructor(
    private readonly db: PrismaService,
    private readonly cashbackService: CashbackService,
  ) {}

  async getWallet(tenantId: string, customerId: string) {
    const customer = await this.db.customer.findUnique({
      where: { id: customerId, tenantId },
      select: { id: true, name: true, cashbackBalance: true, loyaltyPoints: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const [promotionalCredits, transactions, cashbackHistory] = await Promise.all([
      this.getPromotionalBalance(tenantId, customerId),
      this.listTransactions(tenantId, customerId),
      this.cashbackService.listCashbackTransactions(tenantId, customerId),
    ]);

    return {
      customerId,
      cashbackBalance: Number(customer.cashbackBalance),
      promotionalCredits,
      loyaltyPoints: customer.loyaltyPoints,
      transactions,
      cashbackHistory,
    };
  }

  async listTransactions(tenantId: string, customerId: string) {
    const rows = await this.db.customerWalletTransaction.findMany({
      where: { tenantId, customerId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => ({ ...row, amount: Number(row.amount) }));
  }

  async getPromotionalBalance(tenantId: string, customerId: string) {
    const rows = await this.db.customerWalletTransaction.findMany({
      where: { tenantId, customerId },
      select: { type: true, amount: true, expiresAt: true },
    });
    const now = new Date();
    return rows.reduce((sum, row) => {
      if (row.expiresAt && row.expiresAt < now) return sum;
      const amount = Number(row.amount);
      if (row.type === 'credit' || row.type === 'refunded') return sum + amount;
      return sum - amount;
    }, 0);
  }

  async createTransaction(params: {
    tenantId: string;
    customerId: string;
    type: WalletTransactionType;
    amount: number;
    source?: string;
    orderId?: string;
    description?: string;
    expiresAt?: Date;
  }) {
    if (params.amount <= 0) throw new BadRequestException('Amount must be positive');

    return this.db.$transaction(async (tx: Prisma.TransactionClient) => {
      const customer = await tx.customer.findUnique({ where: { id: params.customerId } });
      if (!customer || customer.tenantId !== params.tenantId) throw new NotFoundException('Customer not found');

      if (params.type === 'debit' || params.type === 'expired') {
        const balance = await this.getPromotionalBalance(params.tenantId, params.customerId);
        if (params.type === 'debit' && balance < params.amount) {
          throw new BadRequestException('Insufficient promotional balance');
        }
      }

      const row = await tx.customerWalletTransaction.create({
        data: {
          tenantId: params.tenantId,
          customerId: params.customerId,
          type: params.type,
          source: params.source ?? 'manual',
          amount: params.amount,
          orderId: params.orderId ?? null,
          description: params.description ?? null,
          expiresAt: params.expiresAt ?? null,
        },
      });

      return { ...row, amount: Number(row.amount) };
    });
  }
}
