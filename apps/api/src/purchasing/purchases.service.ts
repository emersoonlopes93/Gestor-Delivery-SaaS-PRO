import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  CreatePurchaseDTO,
  PayPurchaseDTO,
  PaymentStatus,
  PurchaseDTO,
  PurchaseStatus,
  UnitType,
} from '@gestor/types';
import {
  FinancialStatus as PrismaFinancialStatus,
  FinancialTransactionType as PrismaFinancialTransactionType,
  PaymentStatus as PrismaPaymentStatus,
  Prisma,
  PurchaseStatus as PrismaPurchaseStatus,
  StockMovementType as PrismaStockMovementType,
  UnitType as PrismaUnitType,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { runSerializableTransactionWithRetry } from '../database/serializable-transaction';

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,100}$/;
const PURCHASE_REFERENCE_TYPE = 'purchase';

const purchaseInclude = Prisma.validator<Prisma.PurchaseInclude>()({
  supplier: true,
  items: { include: { ingredient: true } },
  settlement: true,
});

type PurchaseWithDetails = Prisma.PurchaseGetPayload<{ include: typeof purchaseInclude }>;

function normalizePurchaseDate(value: Date | string | undefined): Date {
  if (value === undefined) return new Date();
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new BadRequestException('Data da compra invalida.');
    return value;
  }
  const dateValue = value.trim();
  if (!dateValue) throw new BadRequestException('Data da compra invalida.');
  const dateOnly = DATE_ONLY_PATTERN.exec(dateValue);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const date = new Date(Date.UTC(year, month - 1, day, 12));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new BadRequestException('Data da compra invalida.');
    }
    return date;
  }
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) throw new BadRequestException('Data da compra invalida.');
  return date;
}

function validateCreateInput(dto: CreatePurchaseDTO): void {
  if (!IDEMPOTENCY_KEY_PATTERN.test(dto.idempotencyKey?.trim() ?? '')) {
    throw new BadRequestException('Chave de idempotencia invalida.');
  }
  if (!dto.items.length) throw new BadRequestException('A compra precisa ter ao menos um item.');
  if (dto.items.some((item) => !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0)) {
    throw new BadRequestException('Quantidade de item invalida.');
  }
  if (dto.items.some((item) => !Number.isFinite(Number(item.unitCost)) || Number(item.unitCost) < 0)) {
    throw new BadRequestException('Custo unitario invalido.');
  }
  if (dto.paymentStatus === PaymentStatus.PARTIAL || dto.paymentStatus === PaymentStatus.CANCELLED) {
    throw new BadRequestException('Status de pagamento nao suportado para uma nova compra.');
  }
}

function fingerprintCreate(dto: CreatePurchaseDTO, purchaseDate: Date, paymentStatus: PaymentStatus): string {
  const economicPayload = {
    supplierId: dto.supplierId,
    number: dto.number?.trim() || null,
    purchaseDate: dto.purchaseDate === undefined ? null : purchaseDate.toISOString(),
    paymentStatus,
    accountId: dto.accountId ?? null,
    items: dto.items.map((item) => ({
      ingredientId: item.ingredientId,
      quantity: Number(item.quantity),
      unitCost: Number(item.unitCost),
      expiryDate: item.expiryDate ? new Date(item.expiryDate).toISOString() : null,
    })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  };
  return createHash('sha256').update(JSON.stringify(economicPayload)).digest('hex');
}

@Injectable()
export class PurchasesService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string): Promise<PurchaseDTO[]> {
    const purchases = await this.prisma.purchase.findMany({
      where: { tenantId }, include: purchaseInclude, orderBy: { createdAt: 'desc' },
    });
    return purchases.map((purchase) => this.mapToDTO(purchase));
  }

  async findOne(tenantId: string, id: string): Promise<PurchaseDTO> {
    const purchase = await this.prisma.purchase.findFirst({ where: { id, tenantId }, include: purchaseInclude });
    if (!purchase) throw new NotFoundException('Compra nao encontrada');
    return this.mapToDTO(purchase);
  }

  async create(tenantId: string, dto: CreatePurchaseDTO, actorId?: string): Promise<PurchaseDTO> {
    validateCreateInput(dto);
    const purchaseDate = normalizePurchaseDate(dto.purchaseDate);
    const paymentStatus = dto.paymentStatus ?? PaymentStatus.PAID;
    if (paymentStatus === PaymentStatus.PAID && !dto.accountId) {
      throw new BadRequestException('Conta financeira obrigatoria para compra paga.');
    }
    const fingerprint = fingerprintCreate(dto, purchaseDate, paymentStatus);
    const idempotencyKey = dto.idempotencyKey.trim();
    const totalValue = dto.items.reduce((total, item) => total + Number(item.quantity) * Number(item.unitCost), 0);

    try {
      const purchaseId = await runSerializableTransactionWithRetry(this.prisma, async (tx) => {
        const existing = await tx.purchase.findUnique({
          where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
          select: { id: true, idempotencyFingerprint: true },
        });
        if (existing) {
          if (existing.idempotencyFingerprint !== fingerprint) {
            throw new ConflictException('A chave de idempotencia ja foi usada com outra compra.');
          }
          return existing.id;
        }

        const supplier = await tx.supplier.findFirst({ where: { id: dto.supplierId, tenantId }, select: { id: true } });
        if (!supplier) throw new NotFoundException('Fornecedor nao encontrado');

        if (paymentStatus === PaymentStatus.PAID) {
          await this.requireActiveAccount(tx, tenantId, dto.accountId as string);
        }

        const purchase = await tx.purchase.create({
          data: {
            tenantId,
            supplierId: dto.supplierId,
            number: dto.number?.trim() || null,
            totalValue,
            status: PrismaPurchaseStatus.received,
            paymentStatus: paymentStatus as PrismaPaymentStatus,
            purchaseDate,
            idempotencyKey,
            idempotencyFingerprint: fingerprint,
          },
          select: { id: true },
        });

        for (const inputItem of dto.items) {
          const ingredient = await tx.ingredient.findFirst({
            where: { id: inputItem.ingredientId, tenantId },
            select: { id: true, currentStock: true, currentCost: true },
          });
          if (!ingredient) throw new NotFoundException(`Insumo ${inputItem.ingredientId} nao encontrado`);
          const quantity = Number(inputItem.quantity);
          const unitCost = Number(inputItem.unitCost);
          const oldStock = Number(ingredient.currentStock);
          const finalAverageCost = oldStock > 0
            ? (oldStock * Number(ingredient.currentCost) + quantity * unitCost) / (oldStock + quantity)
            : unitCost;
          const item = await tx.purchaseItem.create({
            data: {
              tenantId,
              purchaseId: purchase.id,
              ingredientId: inputItem.ingredientId,
              quantity,
              unitCost,
              totalCost: quantity * unitCost,
              expiryDate: inputItem.expiryDate,
            },
            select: { id: true },
          });
          const updatedIngredient = await tx.ingredient.updateMany({
            where: { id: inputItem.ingredientId, tenantId },
            data: { currentStock: { increment: quantity }, currentCost: finalAverageCost },
          });
          if (updatedIngredient.count !== 1) throw new NotFoundException('Insumo nao encontrado');
          await tx.stockMovement.create({
            data: {
              tenantId,
              ingredientId: inputItem.ingredientId,
              purchaseId: purchase.id,
              purchaseItemId: item.id,
              type: PrismaStockMovementType.purchase_entry,
              quantity,
              unitCost,
              notes: `Entrada via compra ${purchase.id}`,
            },
          });
        }

        const transaction = await tx.financialTransaction.create({
          data: {
            tenantId,
            accountId: paymentStatus === PaymentStatus.PAID ? dto.accountId : null,
            type: PrismaFinancialTransactionType.expense,
            category: 'purchase',
            amount: totalValue,
            status: paymentStatus === PaymentStatus.PAID ? PrismaFinancialStatus.paid : PrismaFinancialStatus.pending,
            paymentDate: paymentStatus === PaymentStatus.PAID ? new Date() : null,
            description: `Compra fornecedor - Ref #${purchase.id}`,
            referenceId: purchase.id,
            referenceType: PURCHASE_REFERENCE_TYPE,
          },
          select: { id: true },
        });

        if (paymentStatus === PaymentStatus.PAID) {
          await this.debitActiveAccount(tx, tenantId, dto.accountId as string, totalValue);
          await tx.purchaseSettlement.create({
            data: {
              tenantId,
              purchaseId: purchase.id,
              accountId: dto.accountId as string,
              amount: totalValue,
              financialTransactionId: transaction.id,
            },
          });
        }
        await this.audit(tx, tenantId, actorId, 'purchase.created', purchase.id, {
          paymentStatus, idempotencyKey,
        });
        return purchase.id;
      });
      return this.findOne(tenantId, purchaseId);
    } catch (error: unknown) {
      if (error instanceof ConflictException || error instanceof BadRequestException || error instanceof NotFoundException) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.purchase.findUnique({
          where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
          select: { id: true, idempotencyFingerprint: true },
        });
        if (existing?.idempotencyFingerprint === fingerprint) return this.findOne(tenantId, existing.id);
        throw new ConflictException('A chave de idempotencia ja foi usada com outra compra.');
      }
      throw error;
    }
  }

  async pay(tenantId: string, purchaseId: string, dto: PayPurchaseDTO, actorId?: string): Promise<PurchaseDTO> {
    if (!dto.accountId) throw new BadRequestException('Conta financeira obrigatoria.');
    await runSerializableTransactionWithRetry(this.prisma, async (tx) => {
      await this.lockPurchase(tx, tenantId, purchaseId);
      const purchase = await tx.purchase.findFirst({
        where: { id: purchaseId, tenantId }, include: { settlement: true },
      });
      if (!purchase) throw new NotFoundException('Compra nao encontrada');
      if (purchase.status === PrismaPurchaseStatus.cancelled) throw new ConflictException('Compra cancelada nao pode ser paga.');
      if (purchase.paymentStatus === PrismaPaymentStatus.partial) throw new ConflictException('Pagamento parcial legado requer reconciliacao manual.');
      if (purchase.settlement) return;
      if (purchase.paymentStatus !== PrismaPaymentStatus.pending) throw new ConflictException('Compra nao esta pendente de pagamento.');
      await this.requireActiveAccount(tx, tenantId, dto.accountId);
      const payable = await tx.financialTransaction.findMany({
        where: {
          tenantId, referenceId: purchaseId, referenceType: PURCHASE_REFERENCE_TYPE,
          type: PrismaFinancialTransactionType.expense,
        },
      });
      if (payable.length !== 1 || payable[0].status !== PrismaFinancialStatus.pending) {
        throw new ConflictException('Lancamento pendente da compra nao e inequivoco.');
      }
      const paidAt = new Date();
      const promoted = await tx.financialTransaction.updateMany({
        where: { id: payable[0].id, tenantId, status: PrismaFinancialStatus.pending },
        data: { accountId: dto.accountId, status: PrismaFinancialStatus.paid, paymentDate: paidAt },
      });
      if (promoted.count !== 1) throw new ConflictException('Pagamento alterado concorrentemente.');
      await this.debitActiveAccount(tx, tenantId, dto.accountId, Number(purchase.totalValue));
      await tx.purchaseSettlement.create({
        data: {
          tenantId, purchaseId, accountId: dto.accountId, amount: purchase.totalValue,
          financialTransactionId: payable[0].id, paidAt,
        },
      });
      const markedPaid = await tx.purchase.updateMany({
        where: { id: purchaseId, tenantId, paymentStatus: PrismaPaymentStatus.pending },
        data: { paymentStatus: PrismaPaymentStatus.paid },
      });
      if (markedPaid.count !== 1) throw new ConflictException('Compra alterada concorrentemente.');
      await this.audit(tx, tenantId, actorId, 'purchase.paid', purchaseId, { accountId: dto.accountId });
    });
    return this.findOne(tenantId, purchaseId);
  }

  async cancel(tenantId: string, purchaseId: string, actorId?: string): Promise<PurchaseDTO> {
    await runSerializableTransactionWithRetry(this.prisma, async (tx) => {
      await this.lockPurchase(tx, tenantId, purchaseId);
      const purchase = await tx.purchase.findFirst({
        where: { id: purchaseId, tenantId },
        include: { items: true, stockMovements: { where: { type: PrismaStockMovementType.purchase_entry }, include: { reversal: true } }, settlement: true },
      });
      if (!purchase) throw new NotFoundException('Compra nao encontrada');
      if (purchase.status === PrismaPurchaseStatus.cancelled) return;
      if (purchase.paymentStatus === PrismaPaymentStatus.partial) throw new ConflictException('Compra com pagamento parcial legado requer reconciliacao manual.');
      if (purchase.stockMovements.length !== purchase.items.length
        || purchase.stockMovements.some((movement) => !movement.purchaseItemId)) {
        throw new ConflictException('Compra historica sem vinculo de estoque; reconciliacao manual obrigatoria.');
      }
      if (purchase.stockMovements.some((movement) => movement.reversal)) {
        throw new ConflictException('Compra possui reversao parcial inconsistente; reconciliacao manual obrigatoria.');
      }

      const requiredByIngredient = new Map<string, Prisma.Decimal>();
      for (const movement of purchase.stockMovements) {
        const current = requiredByIngredient.get(movement.ingredientId) ?? new Prisma.Decimal(0);
        requiredByIngredient.set(movement.ingredientId, current.plus(movement.quantity));
      }
      for (const [ingredientId, required] of requiredByIngredient) {
        const ingredient = await tx.ingredient.findFirst({ where: { id: ingredientId, tenantId }, select: { currentStock: true } });
        if (!ingredient || ingredient.currentStock.lessThan(required)) {
          throw new ConflictException('Estoque insuficiente; reconciliacao de estoque obrigatoria antes do cancelamento.');
        }
      }
      for (const movement of purchase.stockMovements) {
        await tx.stockMovement.create({
          data: {
            tenantId,
            ingredientId: movement.ingredientId,
            purchaseId,
            type: PrismaStockMovementType.purchase_reversal,
            quantity: movement.quantity,
            unitCost: movement.unitCost,
            reversalOfMovementId: movement.id,
            notes: `Reversao da compra ${purchaseId}`,
          },
        });
        const decremented = await tx.ingredient.updateMany({
          where: { id: movement.ingredientId, tenantId, currentStock: { gte: movement.quantity } },
          data: { currentStock: { decrement: movement.quantity } },
        });
        if (decremented.count !== 1) {
          throw new ConflictException('Estoque mudou durante o cancelamento; reconciliacao obrigatoria.');
        }
      }

      if (purchase.settlement) {
        if (purchase.settlement.reversedAt || purchase.settlement.reversalTransactionId) {
          throw new ConflictException('Liquidacao ja possui reversao inconsistente.');
        }
        const original = await tx.financialTransaction.findFirst({
          where: { id: purchase.settlement.financialTransactionId, tenantId, status: PrismaFinancialStatus.paid },
        });
        if (!original || original.accountId !== purchase.settlement.accountId) {
          throw new ConflictException('Liquidacao financeira da compra nao e inequivoca.');
        }
        const reversal = await tx.financialTransaction.create({
          data: {
            tenantId,
            accountId: original.accountId,
            type: PrismaFinancialTransactionType.income,
            category: 'purchase_reversal',
            amount: original.amount,
            status: PrismaFinancialStatus.paid,
            paymentDate: new Date(),
            description: `Reversao financeira da compra #${purchaseId}`,
            referenceId: purchaseId,
            referenceType: 'purchase_reversal',
            reversalOfTransactionId: original.id,
          }, select: { id: true },
        });
        const restored = await tx.financialAccount.updateMany({
          where: { id: original.accountId, tenantId }, data: { balance: { increment: original.amount } },
        });
        if (restored.count !== 1) throw new ConflictException('Conta financeira da liquidacao nao foi encontrada.');
        await tx.purchaseSettlement.update({
          where: { purchaseId }, data: { reversedAt: new Date(), reversalTransactionId: reversal.id },
        });
      } else {
        const pending = await tx.financialTransaction.findMany({
          where: { tenantId, referenceId: purchaseId, referenceType: PURCHASE_REFERENCE_TYPE, type: PrismaFinancialTransactionType.expense },
        });
        if (pending.length !== 1 || pending[0].status !== PrismaFinancialStatus.pending) {
          throw new ConflictException('Lancamento pendente da compra nao e inequivoco.');
        }
        await tx.financialTransaction.update({
          where: { id: pending[0].id }, data: { status: PrismaFinancialStatus.cancelled },
        });
      }
      await tx.purchase.update({
        where: { id: purchaseId },
        data: { status: PrismaPurchaseStatus.cancelled, paymentStatus: PrismaPaymentStatus.cancelled, cancelledAt: new Date() },
      });
      await this.audit(tx, tenantId, actorId, 'purchase.cancelled', purchaseId, { wasPaid: Boolean(purchase.settlement) });
    });
    return this.findOne(tenantId, purchaseId);
  }

  private async lockPurchase(tx: Prisma.TransactionClient, tenantId: string, purchaseId: string): Promise<void> {
    const lockKey = `${tenantId}:purchase:${purchaseId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
  }

  private async requireActiveAccount(tx: Prisma.TransactionClient, tenantId: string, accountId: string): Promise<void> {
    const account = await tx.financialAccount.findFirst({ where: { id: accountId, tenantId, active: true }, select: { id: true } });
    if (!account) throw new NotFoundException('Conta financeira ativa nao encontrada.');
  }

  private async debitActiveAccount(tx: Prisma.TransactionClient, tenantId: string, accountId: string, amount: number): Promise<void> {
    const updated = await tx.financialAccount.updateMany({
      where: { id: accountId, tenantId, active: true }, data: { balance: { decrement: amount } },
    });
    if (updated.count !== 1) throw new NotFoundException('Conta financeira ativa nao encontrada.');
  }

  private async audit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorId: string | undefined,
    action: string,
    purchaseId: string,
    details: Prisma.InputJsonValue,
  ): Promise<void> {
    await tx.auditLog.create({
      data: { tenantId, userId: actorId, userType: 'tenant', action, resource: `purchase:${purchaseId}`, details },
    });
  }

  private mapUnit(unit: PrismaUnitType): UnitType {
    const map: Record<PrismaUnitType, UnitType> = {
      [PrismaUnitType.un]: UnitType.UN,
      [PrismaUnitType.g]: UnitType.G,
      [PrismaUnitType.kg]: UnitType.KG,
      [PrismaUnitType.ml]: UnitType.ML,
      [PrismaUnitType.l]: UnitType.L,
    };
    return map[unit];
  }

  private mapToDTO(purchase: PurchaseWithDetails): PurchaseDTO {
    return {
      id: purchase.id,
      tenantId: purchase.tenantId,
      supplierId: purchase.supplierId,
      number: purchase.number ?? undefined,
      totalValue: Number(purchase.totalValue),
      status: purchase.status as PurchaseStatus,
      paymentStatus: purchase.paymentStatus as PaymentStatus,
      purchaseDate: purchase.purchaseDate,
      createdAt: purchase.createdAt,
      updatedAt: purchase.updatedAt,
      cancelledAt: purchase.cancelledAt ?? undefined,
      supplier: purchase.supplier,
      items: purchase.items.map((item) => ({
        id: item.id,
        tenantId: item.tenantId,
        purchaseId: item.purchaseId,
        ingredientId: item.ingredientId,
        quantity: Number(item.quantity),
        unitCost: Number(item.unitCost),
        totalCost: Number(item.totalCost),
        expiryDate: item.expiryDate ?? undefined,
        ingredientName: item.ingredient?.name,
        ingredientUnit: item.ingredient?.unit ? this.mapUnit(item.ingredient.unit) : undefined,
      })),
      settlement: purchase.settlement ? {
        id: purchase.settlement.id,
        purchaseId: purchase.settlement.purchaseId,
        accountId: purchase.settlement.accountId,
        amount: Number(purchase.settlement.amount),
        financialTransactionId: purchase.settlement.financialTransactionId,
        paidAt: purchase.settlement.paidAt,
        reversedAt: purchase.settlement.reversedAt ?? undefined,
        reversalTransactionId: purchase.settlement.reversalTransactionId ?? undefined,
      } : undefined,
    };
  }
}
