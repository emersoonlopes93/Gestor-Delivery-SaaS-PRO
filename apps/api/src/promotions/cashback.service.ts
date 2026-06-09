import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CashbackTransactionType, CashbackTransaction, Prisma } from '@prisma/client';

@Injectable()
export class CashbackService {
  constructor(private readonly db: PrismaService) {}

  async listCashbackTransactions(tenantId: string, customerId: string) {
    const transactions = await this.db.cashbackTransaction.findMany({
      where: { tenantId, customerId },
      orderBy: { createdAt: 'desc' },
    });

    return transactions.map((t: CashbackTransaction) => ({
      ...t,
      amount: Number(t.amount),
    }));
  }

  // Safe ledger mechanism for generating cashback (earned) or taking away (redeemed/expired)
  async createTransaction(params: {
    tenantId: string;
    customerId: string;
    type: CashbackTransactionType;
    amount: number;
    orderId?: string;
    description?: string;
    expiresAt?: Date;
  }) {
    if (params.amount < 0) {
      throw new BadRequestException('Amount must be positive');
    }
    
    // We do this in a transaction because we need to update the customer's balance securely
    return this.db.$transaction(async (tx: Prisma.TransactionClient) => {
      const customer = await tx.customer.findUnique({
        where: { id: params.customerId },
      });

      if (!customer || customer.tenantId !== params.tenantId) {
        throw new NotFoundException('Customer not found');
      }

      // If it's a debit type (redeemed or expired), we must ensure balance
      if (params.type === 'used' || params.type === 'expired' || params.type === 'refunded') {
        const currentBalance = Number(customer.cashbackBalance);
        if (params.type === 'used' && currentBalance < params.amount) {
          throw new BadRequestException('Insufficient cashback balance');
        }
        
        let newBalance = currentBalance;
        // Se for uso ou expiração, verificar saldo
        if (params.type === 'used' || params.type === 'expired') {
          newBalance -= params.amount;
        } else if (params.type === 'refunded') {
           // Refund adds balance back
           newBalance += params.amount;
        }

        // Just a sanity check. Expired or redeemed shouldn't go below 0 usually, 
        // but if it does we floor to 0.
        if (newBalance < 0) newBalance = 0;

        await tx.customer.update({
          where: { id: params.customerId },
          data: { cashbackBalance: newBalance },
        });

      } else {
         // Earned adds to the balance
         await tx.customer.update({
          where: { id: params.customerId },
          data: { cashbackBalance: { increment: params.amount } },
        });
      }

      const transaction = await tx.cashbackTransaction.create({
        data: {
          tenantId: params.tenantId,
          customerId: params.customerId,
          type: params.type,
          amount: params.amount,
          orderId: params.orderId || null,
          description: params.description || null,
          expiresAt: params.expiresAt || null,
        },
      });

      return {
        ...transaction,
        amount: Number(transaction.amount),
      };
    });
  }

  // Helper method for POS checkout
  async getCashbackBalance(tenantId: string, customerId: string) {
    const customer = await this.db.customer.findUnique({
      where: { id: customerId, tenantId },
      select: { cashbackBalance: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return Number(customer.cashbackBalance);
  }

  async earnForOrder(tenantId: string, orderId: string) {
    const order = await this.db.order.findFirst({
      where: { id: orderId, tenantId, customerId: { not: null } },
      select: { id: true, orderNumber: true, customerId: true, total: true },
    });
    if (!order?.customerId) return null;

    const existing = await this.db.cashbackTransaction.findFirst({
      where: { tenantId, orderId, type: 'earned' },
      select: { id: true },
    });
    if (existing) return null;

    const settings = await this.db.tenantSettings.findUnique({
      where: { tenantId },
      select: { cashbackEnabled: true, cashbackPercent: true, cashbackValidityDays: true },
    });
    if (settings && !settings.cashbackEnabled) return null;

    const percent = settings?.cashbackPercent ?? 5;
    const amount = Number((Number(order.total) * (percent / 100)).toFixed(2));
    if (amount <= 0) return null;

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (settings?.cashbackValidityDays ?? 90));

    return this.createTransaction({
      tenantId,
      customerId: order.customerId,
      type: 'earned',
      amount,
      orderId: order.id,
      description: `Cashback ${percent}% do pedido ${order.orderNumber}`,
      expiresAt,
    });
  }
}
