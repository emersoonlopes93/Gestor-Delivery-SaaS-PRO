import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
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

  /**
   * Open a new cash session for an operator.
   */
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

    try {
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

        // Buscar sessão com operador incluído para o DTO
        const sessionWithOperator = await tx.cashSession.findUnique({
          where: { id: newSession.id },
          include: { 
            operator: { 
              select: { name: true } 
            } 
          },
        });

        if (!sessionWithOperator) {
          throw new InternalServerErrorException('Falha ao recuperar sessão de caixa após criação');
        }
        
        return sessionWithOperator;
      });

      return this.mapSessionToDTO(session);
    } catch (error) {
      if (error instanceof ConflictException || error instanceof InternalServerErrorException) {
        throw error;
      }
      throw new InternalServerErrorException('Erro ao abrir sessão de caixa: ' + (error instanceof Error ? error.message : String(error)));
    }
  }

  /**
   * Close an open cash session.
   */
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

  /**
   * Get active session for current operator.
   */
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

  /**
   * List all sessions for a tenant.
   */
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

  /**
   * Get detailed session info.
   */
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

  /**
   * Add a manual movement (withdrawal or supply).
   */
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

  /**
   * Register a sale as a cash movement.
   */
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
        paymentMethod: paymentMethod as any, // Enum type checking via cast if necessary
        orderId,
        description: 'Venda PDV',
      },
    });
  }

  /**
   * Register a refund as a cash movement.
   */
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

  /**
   * Helper to calculate expected cash balance in a session.
   */
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
      }
    }

    return Math.round(expected * 100) / 100;
  }

  /**
   * Mapper for Session DTO.
   */
  private mapSessionToDTO(session: any): CashSessionDTO {
    return {
      id: session.id,
      tenantId: session.tenantId,
      operatorId: session.operatorId,
      operatorName: session.operator?.name || 'Operador Desconhecido',
      status: session.status,
      openingAmount: Number(session.openingAmount),
      openedAt: session.openedAt.toISOString(),
      closedAt: session.closedAt?.toISOString() || null,
      closingAmountDeclared: session.closingAmountDeclared !== null ? Number(session.closingAmountDeclared) : null,
      closingAmountCalculated: session.closingAmountCalculated !== null ? Number(session.closingAmountCalculated) : null,
      closingDifference: session.closingDifference !== null ? Number(session.closingDifference) : null,
      notes: session.notes || null,
    };
  }

  /**
   * Mapper for Detailed Session DTO.
   */
  private mapSessionDetailToDTO(session: any): CashSessionDetailDTO {
    const base = this.mapSessionToDTO(session);
    const movements = (session.movements || []).map((m: any) => this.mapMovementToDTO(m));

    return {
      ...base,
      movements,
      totalSales: movements.filter((m: any) => m.type === 'sale').reduce((s: number, m: any) => s + m.amount, 0),
      totalWithdrawals: movements.filter((m: any) => m.type === 'withdrawal').reduce((s: number, m: any) => s + m.amount, 0),
      totalSupplies: movements.filter((m: any) => m.type === 'supply').reduce((s: number, m: any) => s + m.amount, 0),
      totalRefunds: movements.filter((m: any) => m.type === 'refund').reduce((s: number, m: any) => s + m.amount, 0),
    };
  }

  /**
   * Mapper for Movement DTO.
   */
  private mapMovementToDTO(m: any): CashMovementDTO {
    return {
      id: m.id,
      type: m.type,
      amount: Number(m.amount),
      paymentMethod: m.paymentMethod || null,
      orderId: m.orderId || null,
      orderNumber: m.order?.orderNumber || null,
      description: m.description || null,
      createdAt: m.createdAt.toISOString(),
    };
  }
}

