import {
  Injectable,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  CashSessionDTO,
  CashSessionDetailDTO,
  CashMovementDTO,
  CashSessionStatus,
  CashMovementType,
} from '@gestor/types';
import { PaymentMethod as PrismaPaymentMethod, Prisma } from '@prisma/client';
import { runSerializableTransactionWithRetry } from '../database/serializable-transaction';

@Injectable()
export class CashService {
  constructor(private readonly prisma: PrismaService) {}

  private parsePaymentMethod(value: string | null | undefined): PrismaPaymentMethod | null {
    switch (value) {
      case 'cash':
        return PrismaPaymentMethod.cash;
      case 'pix':
        return PrismaPaymentMethod.pix;
      case 'credit_card':
        return PrismaPaymentMethod.credit_card;
      case 'debit_card':
        return PrismaPaymentMethod.debit_card;
      case 'card_on_delivery':
        return PrismaPaymentMethod.card_on_delivery;
      case 'other':
        return PrismaPaymentMethod.other;
      default:
        return null;
    }
  }

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

  async closeActiveSession(
    tenantId: string,
    operatorId: string,
    closingAmountDeclared: number,
    notes?: string,
  ): Promise<CashSessionDetailDTO> {
    const session = await this.prisma.cashSession.findFirst({
      where: { tenantId, operatorId, status: 'open' },
      select: { id: true },
    });

    if (!session) {
      throw new BadRequestException('Nenhum caixa aberto para fechar.');
    }

    return this.closeSession(
      tenantId,
      session.id,
      operatorId,
      closingAmountDeclared,
      notes,
    );
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
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockCashSession(tx, tenantId, sessionId);

      const session = await tx.cashSession.findFirst({
        where: { id: sessionId, tenantId, operatorId, status: 'open' },
      });
      if (!session) {
        throw new NotFoundException(
          'Sessão de caixa não encontrada ou já fechada.',
        );
      }

      const movements = await tx.cashMovement.findMany({
        where: { tenantId, cashSessionId: sessionId },
        select: {
          type: true,
          amount: true,
          paymentMethod: true,
          orderId: true,
        },
      });
      const closingAmountCalculated = this.calculateExpectedCashAmount(movements.map((movement) => ({
        type: movement.type as CashMovementType,
        amount: Number(movement.amount),
        paymentMethod: movement.paymentMethod,
        orderId: movement.orderId,
      })));
      const closingDifference = closingAmountDeclared - closingAmountCalculated;

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

  private async lockCashSession(
    client: Prisma.TransactionClient,
    tenantId: string,
    cashSessionId: string,
  ): Promise<void> {
    await client.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${`cash-session:${tenantId}:${cashSessionId}`}))
    `;
  }

  private async lockRefund(
    client: Prisma.TransactionClient,
    tenantId: string,
    cashSessionId: string,
    orderId: string,
  ): Promise<void> {
    await client.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext(${`cash-refund:${tenantId}:${cashSessionId}:${orderId}`}))
    `;
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

  async addMovementToActiveSession(
    tenantId: string,
    operatorId: string,
    type: 'withdrawal' | 'supply',
    amount: number,
    description?: string,
  ): Promise<CashMovementDTO> {
    const session = await this.prisma.cashSession.findFirst({
      where: { tenantId, operatorId, status: 'open' },
      select: { id: true },
    });

    if (!session) {
      throw new BadRequestException('Abra o caixa antes de registrar movimentaÃ§Ãµes.');
    }

    return this.addMovement(tenantId, session.id, operatorId, type, amount, description);
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
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const parsedPaymentMethod = this.parsePaymentMethod(paymentMethod);
    const client = tx || this.prisma;
    await client.cashMovement.create({
      data: {
        tenantId,
        cashSessionId,
        type: 'sale',
        amount,
        ...(parsedPaymentMethod ? { paymentMethod: parsedPaymentMethod } : {}),
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
    paymentMethod: string | null | undefined,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const createRefund = async (client: Prisma.TransactionClient): Promise<void> => {
      // Closing and refunds share a session lock so a refund cannot be written
      // between the close calculation and its persisted snapshot. The second,
      // refund-specific lock preserves idempotency for concurrent retries.
      await this.lockCashSession(client, tenantId, cashSessionId);
      await this.lockRefund(client, tenantId, cashSessionId, orderId);

      const session = await client.cashSession.findFirst({
        where: { id: cashSessionId, tenantId },
        select: {
          id: true,
          status: true,
          closingAmountDeclared: true,
        },
      });
      if (!session) {
        throw new NotFoundException('Sessão de caixa não encontrada para registrar o estorno.');
      }

      const existingRefund = await client.cashMovement.findFirst({
        where: { tenantId, cashSessionId, orderId, type: 'refund' },
        select: { id: true },
      });
      if (existingRefund) return;

      const parsedPaymentMethod = this.parsePaymentMethod(paymentMethod);
      const originalSale = parsedPaymentMethod
        ? null
        : await client.cashMovement.findFirst({
            where: { tenantId, cashSessionId, orderId, type: 'sale' },
            select: { paymentMethod: true },
          });
      const physicalPaymentMethod = parsedPaymentMethod ?? originalSale?.paymentMethod ?? null;

      await client.cashMovement.create({
        data: {
          tenantId,
          cashSessionId,
          type: 'refund',
          amount,
          ...(parsedPaymentMethod ? { paymentMethod: parsedPaymentMethod } : {}),
          orderId,
          description: 'Estorno de venda PDV',
        },
      });

      // A closed session exposes its persisted closing snapshot instead of
      // recalculating on every read. Keep that snapshot aligned with the cash
      // ledger when a cash refund is recorded against the original session.
      // The declared count is historical and intentionally remains unchanged.
      if (session.status === 'closed' && physicalPaymentMethod === PrismaPaymentMethod.cash) {
        const movements = await client.cashMovement.findMany({
          where: { tenantId, cashSessionId },
          select: {
            type: true,
            amount: true,
            paymentMethod: true,
            orderId: true,
          },
        });
        const closingAmountCalculated = this.calculateExpectedCashAmount(movements.map((movement) => ({
          type: movement.type as CashMovementType,
          amount: Number(movement.amount),
          paymentMethod: movement.paymentMethod,
          orderId: movement.orderId,
        })));
        const closingAmountDeclared = Number(session.closingAmountDeclared);

        await client.cashSession.update({
          where: { id: session.id },
          data: {
            closingAmountCalculated,
            ...(session.closingAmountDeclared !== null
              ? { closingDifference: closingAmountDeclared - closingAmountCalculated }
              : {}),
          },
        });
      }
    };

    if (tx) {
      await createRefund(tx);
      return;
    }

    await runSerializableTransactionWithRetry(this.prisma, createRefund);
  }

  private calculateExpectedCashAmount(
    movements: Array<{
      type: CashMovementType;
      amount: number;
      paymentMethod?: PrismaPaymentMethod | null;
      orderId?: string | null;
    }>,
  ): number {
    const salePaymentMethodsByOrderId = new Map<string, PrismaPaymentMethod | null>();
    for (const movement of movements) {
      if (movement.type === 'sale' && movement.orderId) {
        salePaymentMethodsByOrderId.set(movement.orderId, movement.paymentMethod ?? null);
      }
    }

    let expected = 0;
    for (const movement of movements) {
      switch (movement.type) {
        case 'opening':
        case 'supply':
          expected += movement.amount;
          break;
        case 'sale':
          if (movement.paymentMethod === PrismaPaymentMethod.cash) {
            expected += movement.amount;
          }
          break;
        case 'withdrawal':
          expected -= movement.amount;
          break;
        case 'refund': {
          const refundPaymentMethod = movement.paymentMethod
            ?? (movement.orderId ? salePaymentMethodsByOrderId.get(movement.orderId) : null);
          if (refundPaymentMethod === PrismaPaymentMethod.cash) {
            expected -= movement.amount;
          }
          break;
        }
      }
    }

    return Math.round(expected * 100) / 100;
  }

  /**
   * Mapper for Session DTO.
   */
  private mapSessionToDTO(
    session: Prisma.CashSessionGetPayload<{ include: { operator: { select: { name: true } } } }>,
  ): CashSessionDTO {
    return {
      id: session.id,
      tenantId: session.tenantId,
      operatorId: session.operatorId,
      operatorName: session.operator?.name || 'Operador Desconhecido',
      status: session.status as CashSessionStatus,
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
  private mapSessionDetailToDTO(
    session: Prisma.CashSessionGetPayload<{
      include: {
        operator: { select: { name: true } };
        movements: { include: { order: { select: { orderNumber: true } } } };
      };
    }>,
  ): CashSessionDetailDTO {
    const base = this.mapSessionToDTO(session);
    const movements = (session.movements || []).map((m) => this.mapMovementToDTO(m));

    return {
      ...base,
      movements,
      totalSales: movements.filter((m) => m.type === 'sale').reduce((s, m) => s + m.amount, 0),
      totalCash: movements.filter((m) => m.type === 'sale' && m.paymentMethod === 'cash').reduce((s, m) => s + m.amount, 0),
      totalPix: movements.filter((m) => m.type === 'sale' && m.paymentMethod === 'pix').reduce((s, m) => s + m.amount, 0),
      totalCreditCard: movements.filter((m) => m.type === 'sale' && m.paymentMethod === 'credit_card').reduce((s, m) => s + m.amount, 0),
      totalDebitCard: movements.filter((m) => m.type === 'sale' && m.paymentMethod === 'debit_card').reduce((s, m) => s + m.amount, 0),
      totalOther: movements.filter((m) => m.type === 'sale' && (!m.paymentMethod || !['cash', 'pix', 'credit_card', 'debit_card'].includes(m.paymentMethod))).reduce((s, m) => s + m.amount, 0),
      totalWithdrawals: movements.filter((m) => m.type === 'withdrawal').reduce((s, m) => s + m.amount, 0),
      totalSupplies: movements.filter((m) => m.type === 'supply').reduce((s, m) => s + m.amount, 0),
      totalRefunds: movements.filter((m) => m.type === 'refund').reduce((s, m) => s + m.amount, 0),
      expectedAmount: session.closingAmountCalculated !== null
        ? Number(session.closingAmountCalculated)
        : this.calculateExpectedCashAmount(movements.map((movement) => ({
            type: movement.type,
            amount: movement.amount,
            paymentMethod: this.parsePaymentMethod(movement.paymentMethod || ''),
            orderId: movement.orderId,
          }))),
    };
  }

  /**
   * Mapper for Movement DTO.
   */
  private mapMovementToDTO(
    m: Prisma.CashMovementGetPayload<{ include: { order: { select: { orderNumber: true } } } }>,
  ): CashMovementDTO {
    return {
      id: m.id,
      type: m.type as CashMovementType,
      amount: Number(m.amount),
      paymentMethod: m.paymentMethod || null,
      orderId: m.orderId || null,
      orderNumber: m.order?.orderNumber || null,
      description: m.description || null,
      createdAt: m.createdAt.toISOString(),
    };
  }
}
