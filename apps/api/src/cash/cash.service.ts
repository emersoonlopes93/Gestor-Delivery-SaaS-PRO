import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type {
  CashSessionDTO,
  CashSessionDetailDTO,
  CashMovementDTO,
} from '@gestor/types';

@Injectable()
export class CashService {
  constructor(private readonly prisma: PrismaService) {}

  // ----------------------------------------------------------------
  // OPEN SESSION
  // ----------------------------------------------------------------
  async openSession(
    tenantId: string,
    operatorId: string,
    openingAmount: number,
  ): Promise<CashSessionDTO> {
    // Enforce: only one open session per operator per tenant
    const existing = await this.prisma.cashSession.findFirst({
      where: { tenantId, operatorId, status: 'open' },
    });

    if (existing) {
      throw new ConflictException(
        'Já existe uma sessão de caixa aberta para este operador. Feche-a antes de abrir outra.',
      );
    }

    const session = await this.prisma.$transaction(async (tx) => {
      const newSession = await tx.cashSession.create({
        data: {
          tenantId,
          operatorId,
          status: 'open',
          openingAmount,
        },
      });

      // Create opening movement
      await tx.cashMovement.create({
        data: {
          tenantId,
          cashSessionId: newSession.id,
          type: 'opening',
          amount: openingAmount,
          description: 'Abertura de caixa',
        },
      });

      // Buscar sessão com operador incluído
      const sessionWithOperator = await tx.cashSession.findUnique({
        where: { id: newSession.id },
        include: { 
          operator: { 
            select: { name: true } 
          } 
        },
      });

      if (!sessionWithOperator) {
        throw new Error('Falha ao criar sessão de caixa');
      }
      
      return sessionWithOperator;
    });

    return this.mapSessionToDTO(session);
  }

  // ----------------------------------------------------------------
  // CLOSE SESSION
  // ----------------------------------------------------------------
  async closeSession(
    tenantId: string,
    sessionId: string,
    operatorId: string,
    closingAmountDeclared: number,
    notes?: string,
  ): Promise<CashSessionDetailDTO> {
    const session = await this.prisma.cashSession.findFirst({
      where: { id: sessionId, tenantId, operatorId, status: 'open' },
    });

    if (!session) {
      throw new NotFoundException(
        'Sessão de caixa não encontrada ou já fechada.',
      );
    }

    // Calculate expected amount
    const closingAmountCalculated = await this.calculateExpectedAmount(sessionId);
    const closingDifference = closingAmountDeclared - closingAmountCalculated;

    const updated = await this.prisma.$transaction(async (tx) => {
      // Create closing movement
      await tx.cashMovement.create({
        data: {
          tenantId,
          cashSessionId: sessionId,
          type: 'closing',
          amount: closingAmountDeclared,
          description: notes || 'Fechamento de caixa',
        },
      });

      return tx.cashSession.update({
        where: { id: sessionId },
        data: {
          status: 'closed',
          closedAt: new Date(),
          closingAmountDeclared,
          closingAmountCalculated,
          closingDifference,
          notes: notes || null,
        },
        include: {
          operator: { select: { name: true } },
          movements: {
            orderBy: { createdAt: 'asc' },
            include: { order: { select: { orderNumber: true } } },
          },
        },
      });
    });

    return this.mapSessionDetailToDTO(updated);
  }

  // ----------------------------------------------------------------
  // GET ACTIVE SESSION (for current operator)
  // ----------------------------------------------------------------
  async getActiveSession(
    tenantId: string,
    operatorId: string,
  ): Promise<CashSessionDTO | null> {
    const session = await this.prisma.cashSession.findFirst({
      where: { tenantId, operatorId, status: 'open' },
      include: { operator: { select: { name: true } } },
    });

    return session ? this.mapSessionToDTO(session) : null;
  }

  // ----------------------------------------------------------------
  // LIST SESSIONS
  // ----------------------------------------------------------------
  async listSessions(
    tenantId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: CashSessionDTO[]; total: number }> {
    const [sessions, total] = await Promise.all([
      this.prisma.cashSession.findMany({
        where: { tenantId },
        orderBy: { openedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { operator: { select: { name: true } } },
      }),
      this.prisma.cashSession.count({ where: { tenantId } }),
    ]);

    return {
      data: sessions.map((s) => this.mapSessionToDTO(s)),
      total,
    };
  }

  // ----------------------------------------------------------------
  // SESSION DETAIL
  // ----------------------------------------------------------------
  async getSessionDetail(
    tenantId: string,
    sessionId: string,
  ): Promise<CashSessionDetailDTO> {
    const session = await this.prisma.cashSession.findFirst({
      where: { id: sessionId, tenantId },
      include: {
        operator: { select: { name: true } },
        movements: {
          orderBy: { createdAt: 'asc' },
          include: { order: { select: { orderNumber: true } } },
        },
      },
    });

    if (!session) {
      throw new NotFoundException('Sessão de caixa não encontrada.');
    }

    return this.mapSessionDetailToDTO(session);
  }

  // ----------------------------------------------------------------
  // ADD MOVEMENT (withdrawal / supply)
  // ----------------------------------------------------------------
  async addMovement(
    tenantId: string,
    sessionId: string,
    operatorId: string,
    type: 'withdrawal' | 'supply',
    amount: number,
    description?: string,
  ): Promise<CashMovementDTO> {
    const session = await this.prisma.cashSession.findFirst({
      where: { id: sessionId, tenantId, operatorId, status: 'open' },
    });

    if (!session) {
      throw new NotFoundException(
        'Sessão de caixa não encontrada, não pertence a este operador, ou já está fechada.',
      );
    }

    const movement = await this.prisma.cashMovement.create({
      data: {
        tenantId,
        cashSessionId: sessionId,
        type,
        amount,
        description: description || (type === 'withdrawal' ? 'Sangria' : 'Suprimento'),
      },
      include: { order: { select: { orderNumber: true } } },
    });

    return this.mapMovementToDTO(movement);
  }

  // ----------------------------------------------------------------
  // REGISTER SALE MOVEMENT (used by POS module)
  // ----------------------------------------------------------------
  async registerSaleMovement(
    tenantId: string,
    cashSessionId: string,
    orderId: string,
    amount: number,
    paymentMethod: string,
  ): Promise<void> {
    await this.prisma.cashMovement.create({
      data: {
        tenantId,
        cashSessionId,
        type: 'sale',
        amount,
        paymentMethod: paymentMethod as 'cash' | 'pix' | 'credit_card' | 'debit_card' | 'other',
        orderId,
        description: 'Venda PDV',
      },
    });
  }

  // ----------------------------------------------------------------
  // REGISTER REFUND MOVEMENT (used for cancellation)
  // ----------------------------------------------------------------
  async registerRefundMovement(
    tenantId: string,
    cashSessionId: string,
    orderId: string,
    amount: number,
  ): Promise<void> {
    await this.prisma.cashMovement.create({
      data: {
        tenantId,
        cashSessionId,
        type: 'refund',
        amount,
        orderId,
        description: 'Estorno de venda PDV',
      },
    });
  }

  // ----------------------------------------------------------------
  // HELPERS
  // ----------------------------------------------------------------
  private async calculateExpectedAmount(sessionId: string): Promise<number> {
    const movements = await this.prisma.cashMovement.findMany({
      where: { cashSessionId: sessionId },
    });

    let expected = 0;
    for (const m of movements) {
      const amount = Number(m.amount);
      switch (m.type) {
        case 'opening':
        case 'sale':
        case 'supply':
          expected += amount;
          break;
        case 'withdrawal':
        case 'refund':
          expected -= amount;
          break;
        // closing and adjustment are not counted
      }
    }

    return Math.round(expected * 100) / 100;
  }

  private mapSessionToDTO(session: Record<string, unknown>): CashSessionDTO {
    const operator = session['operator'] as Record<string, unknown>;
    return {
      id: session['id'] as string,
      tenantId: session['tenantId'] as string,
      operatorId: session['operatorId'] as string,
      operatorName: operator['name'] as string,
      status: session['status'] as CashSessionDTO['status'],
      openingAmount: Number(session['openingAmount']),
      openedAt: (session['openedAt'] as Date).toISOString(),
      closedAt: session['closedAt'] ? (session['closedAt'] as Date).toISOString() : null,
      closingAmountDeclared: session['closingAmountDeclared'] !== null ? Number(session['closingAmountDeclared']) : null,
      closingAmountCalculated: session['closingAmountCalculated'] !== null ? Number(session['closingAmountCalculated']) : null,
      closingDifference: session['closingDifference'] !== null ? Number(session['closingDifference']) : null,
      notes: (session['notes'] as string | null) || null,
    };
  }

  private mapSessionDetailToDTO(session: Record<string, unknown>): CashSessionDetailDTO {
    const base = this.mapSessionToDTO(session);
    const movements = (session['movements'] as Array<Record<string, unknown>>) || [];

    const mapped = movements.map((m) => this.mapMovementToDTO(m));

    return {
      ...base,
      movements: mapped,
      totalSales: mapped.filter(m => m.type === 'sale').reduce((s, m) => s + m.amount, 0),
      totalWithdrawals: mapped.filter(m => m.type === 'withdrawal').reduce((s, m) => s + m.amount, 0),
      totalSupplies: mapped.filter(m => m.type === 'supply').reduce((s, m) => s + m.amount, 0),
      totalRefunds: mapped.filter(m => m.type === 'refund').reduce((s, m) => s + m.amount, 0),
    };
  }

  private mapMovementToDTO(m: Record<string, unknown>): CashMovementDTO {
    const order = m['order'] as Record<string, unknown> | null;
    return {
      id: m['id'] as string,
      type: m['type'] as CashMovementDTO['type'],
      amount: Number(m['amount']),
      paymentMethod: (m['paymentMethod'] as string | null) || null,
      orderId: (m['orderId'] as string | null) || null,
      orderNumber: order ? (order['orderNumber'] as string) : null,
      description: (m['description'] as string | null) || null,
      createdAt: (m['createdAt'] as Date).toISOString(),
    };
  }
}
