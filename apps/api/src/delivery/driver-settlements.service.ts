import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DeliveryRunStatus,
  DriverLedgerEntryType,
  DriverSettlementMethod as PrismaSettlementMethod,
  DriverShiftStatus,
  Prisma,
} from '@prisma/client';
import {
  CreateDriverSettlementDTO,
  DriverSettlementHistoryDTO,
  DriverSettlementMethod,
  DriverSettlementShiftDTO,
  DriverSettlementSummaryDTO,
  DriverShiftPaymentStatus,
} from '@gestor/types';
import { PrismaService } from '../database/prisma.service';

const OPEN_RUN_STATUSES: DeliveryRunStatus[] = [
  DeliveryRunStatus.PENDING_ACCEPTANCE,
  DeliveryRunStatus.ASSIGNED,
  DeliveryRunStatus.IN_PROGRESS,
  DeliveryRunStatus.RETURNING,
];

type ShiftForSettlement = Prisma.DriverShiftGetPayload<{
  include: {
    ledgerEntries: true;
    settlementItem: true;
    runs: { select: { status: true } };
  };
}>;

type SettlementWithItems = Prisma.DriverSettlementGetPayload<{
  include: { items: { include: { shift: true } } };
}>;

@Injectable()
export class DriverSettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  private shiftAmounts(shift: ShiftForSettlement) {
    const grossEarnings = shift.ledgerEntries.reduce((total, entry) => total.plus(entry.amount), new Prisma.Decimal(0));
    const receivedDirectly = shift.ledgerEntries.filter((entry) => entry.receivedDirectlyByDriver)
      .reduce((total, entry) => total.plus(entry.amount), new Prisma.Decimal(0));
    return { grossEarnings, receivedDirectly, amountDue: grossEarnings.minus(receivedDirectly) };
  }

  private isEligible(shift: ShiftForSettlement) {
    const amounts = this.shiftAmounts(shift);
    const dailyPosted = shift.ledgerEntries.some((entry) => entry.type === DriverLedgerEntryType.DAILY_RATE);
    const hasOpenRun = shift.runs.some((run) => OPEN_RUN_STATUSES.includes(run.status));
    return shift.status === DriverShiftStatus.ENDED
      && shift.endedAt !== null
      && (shift.dailyRateSnapshot.lte(0) || dailyPosted)
      && !hasOpenRun
      && shift.settlementItem === null
      && amounts.amountDue.gt(0);
  }

  private shiftDTO(shift: ShiftForSettlement): DriverSettlementShiftDTO {
    const amounts = this.shiftAmounts(shift);
    const grossEarnings = shift.settlementItem?.grossEarnings ?? amounts.grossEarnings;
    const receivedDirectly = shift.settlementItem?.receivedDirectly ?? amounts.receivedDirectly;
    return {
      shiftId: shift.id,
      startedAt: shift.startedAt.toISOString(),
      endedAt: shift.endedAt?.toISOString() ?? shift.startedAt.toISOString(),
      grossEarnings: Number(grossEarnings),
      receivedDirectly: Number(receivedDirectly),
      amountDue: Number(shift.settlementItem?.amountDue ?? amounts.amountDue),
      currency: shift.currencySnapshot,
      status: shift.settlementItem ? DriverShiftPaymentStatus.PAID : DriverShiftPaymentStatus.PENDING,
      settlementId: shift.settlementItem?.settlementId ?? null,
    };
  }

  private async actorNames(tenantId: string, settlements: SettlementWithItems[]) {
    const actorIds = [...new Set(settlements.map((settlement) => settlement.createdBy))];
    const actors = actorIds.length === 0 ? [] : await this.prisma.tenantUser.findMany({
      where: { tenantId, id: { in: actorIds } }, select: { id: true, name: true },
    });
    return new Map(actors.map((actor) => [actor.id, actor.name]));
  }

  private historyDTO(settlement: SettlementWithItems, actorName: string): DriverSettlementHistoryDTO {
    return {
      id: settlement.id,
      driverId: settlement.driverId,
      amount: Number(settlement.amount),
      currency: settlement.currency,
      paymentMethod: DriverSettlementMethod[settlement.paymentMethod],
      paidAt: settlement.paidAt.toISOString(),
      notes: settlement.notes,
      createdBy: settlement.createdBy,
      createdByName: actorName,
      createdAt: settlement.createdAt.toISOString(),
      shifts: settlement.items.map((item) => ({
        shiftId: item.shiftId,
        startedAt: item.shift.startedAt.toISOString(),
        endedAt: item.shift.endedAt?.toISOString() ?? item.shift.startedAt.toISOString(),
        grossEarnings: Number(item.grossEarnings),
        receivedDirectly: Number(item.receivedDirectly),
        amountDue: Number(item.amountDue),
        currency: settlement.currency,
        status: DriverShiftPaymentStatus.PAID,
        settlementId: settlement.id,
      })),
    };
  }

  async listShifts(tenantId: string, driverId: string, status?: DriverShiftPaymentStatus, from?: string, to?: string) {
    const driver = await this.prisma.deliveryDriver.findFirst({ where: { id: driverId, tenantId }, select: { id: true } });
    if (!driver) throw new NotFoundException('Entregador não encontrado.');
    const shifts = await this.prisma.driverShift.findMany({
      where: {
        tenantId, driverId, status: DriverShiftStatus.ENDED,
        ...(from || to ? { endedAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
      },
      include: { ledgerEntries: true, settlementItem: true, runs: { select: { status: true } } },
      orderBy: { endedAt: 'desc' },
    });
    return shifts.filter((shift) => status === DriverShiftPaymentStatus.PAID
      ? shift.settlementItem !== null
      : status === DriverShiftPaymentStatus.PENDING
        ? this.isEligible(shift)
        : shift.settlementItem !== null || this.isEligible(shift)).map((shift) => this.shiftDTO(shift));
  }

  async history(tenantId: string, driverId: string): Promise<DriverSettlementHistoryDTO[]> {
    const settlements = await this.prisma.driverSettlement.findMany({
      where: { tenantId, driverId }, include: { items: { include: { shift: true } } }, orderBy: { paidAt: 'desc' },
    });
    const names = await this.actorNames(tenantId, settlements);
    return settlements.map((settlement) => this.historyDTO(settlement, names.get(settlement.createdBy) ?? 'Usuário do tenant'));
  }

  async detail(tenantId: string, settlementId: string, driverId?: string): Promise<DriverSettlementHistoryDTO> {
    const settlement = await this.prisma.driverSettlement.findFirst({
      where: { id: settlementId, tenantId, ...(driverId ? { driverId } : {}) },
      include: { items: { include: { shift: true } } },
    });
    if (!settlement) throw new NotFoundException('Pagamento do entregador não encontrado.');
    const names = await this.actorNames(tenantId, [settlement]);
    return this.historyDTO(settlement, names.get(settlement.createdBy) ?? 'Usuário do tenant');
  }

  async summary(tenantId: string, driverId: string): Promise<DriverSettlementSummaryDTO> {
    const [pending, history] = await Promise.all([
      this.listShifts(tenantId, driverId, DriverShiftPaymentStatus.PENDING),
      this.history(tenantId, driverId),
    ]);
    return {
      driverId,
      currentDue: pending.reduce((total, shift) => total + shift.amountDue, 0),
      pendingShiftCount: pending.length,
      currency: pending[0]?.currency ?? history[0]?.currency ?? 'BRL',
      lastPayment: history[0] ?? null,
    };
  }

  private sameRequest(existing: SettlementWithItems, dto: CreateDriverSettlementDTO) {
    const existingIds = existing.items.map((item) => item.shiftId).sort();
    const requestedIds = [...dto.shiftIds].sort();
    return existing.driverId === dto.driverId
      && existing.paymentMethod === dto.paymentMethod as PrismaSettlementMethod
      && existingIds.length === requestedIds.length
      && existingIds.every((id, index) => id === requestedIds[index]);
  }

  async create(tenantId: string, actorId: string, dto: CreateDriverSettlementDTO): Promise<DriverSettlementHistoryDTO> {
    try {
      const settlementId = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.driverSettlement.findUnique({
          where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: dto.idempotencyKey } },
          include: { items: { include: { shift: true } } },
        });
        if (existing) {
          if (!this.sameRequest(existing, dto)) throw new ConflictException('A chave de idempotência já foi usada com outro pagamento.');
          return existing.id;
        }
        const driver = await tx.deliveryDriver.findFirst({ where: { id: dto.driverId, tenantId }, select: { id: true } });
        if (!driver) throw new NotFoundException('Entregador não encontrado.');
        const shifts = await tx.driverShift.findMany({
          where: { tenantId, driverId: dto.driverId, id: { in: dto.shiftIds } },
          include: { ledgerEntries: true, settlementItem: true, runs: { select: { status: true } } },
        });
        if (shifts.length !== dto.shiftIds.length) throw new BadRequestException('Um ou mais turnos não pertencem a este entregador.');
        if (shifts.some((shift) => !this.isEligible(shift))) {
          throw new ConflictException('Um ou mais turnos não estão encerrados, possuem rota ativa, saldo zerado ou já foram pagos.');
        }
        const currencies = [...new Set(shifts.map((shift) => shift.currencySnapshot))];
        if (currencies.length !== 1) throw new BadRequestException('Os turnos selecionados precisam usar a mesma moeda.');
        const items = shifts.map((shift) => ({ shift, ...this.shiftAmounts(shift) }));
        const amount = items.reduce((total, item) => total.plus(item.amountDue), new Prisma.Decimal(0));
        const settlement = await tx.driverSettlement.create({
          data: {
            tenantId, driverId: dto.driverId, amount, currency: currencies[0], paymentMethod: dto.paymentMethod,
            paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(), notes: dto.notes?.trim() || null,
            createdBy: actorId, idempotencyKey: dto.idempotencyKey,
            items: { create: items.map((item) => ({
              tenantId, shiftId: item.shift.id, grossEarnings: item.grossEarnings,
              receivedDirectly: item.receivedDirectly, amountDue: item.amountDue,
            })) },
          }, select: { id: true },
        });
        return settlement.id;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return this.detail(tenantId, settlementId);
    } catch (error: unknown) {
      if (error instanceof ConflictException || error instanceof BadRequestException || error instanceof NotFoundException) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2002' || error.code === 'P2034')) {
        const existing = await this.prisma.driverSettlement.findUnique({
          where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: dto.idempotencyKey } },
          include: { items: { include: { shift: true } } },
        });
        if (existing && this.sameRequest(existing, dto)) return this.detail(tenantId, existing.id);
        throw new ConflictException(error.code === 'P2034'
          ? 'O pagamento foi atualizado por outro gestor. Recarregue os turnos e tente novamente.'
          : 'Um dos turnos selecionados já foi pago.');
      }
      throw error;
    }
  }
}
