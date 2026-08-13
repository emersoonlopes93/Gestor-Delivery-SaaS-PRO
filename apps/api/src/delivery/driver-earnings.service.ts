import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DriverLedgerEntryType, DriverPayMode, Prisma } from '@prisma/client';
import {
  DriverEarningsSummaryDTO,
  DriverPayRateTierDTO,
  DriverPaySettingsDTO,
  DriverPayMode as SharedDriverPayMode,
  DriverShiftStatus as SharedDriverShiftStatus,
  UpdateDriverPaySettingsDTO,
} from '@gestor/types';
import { PrismaService } from '../database/prisma.service';

type Tx = Prisma.TransactionClient;
type PaySource = {
  payOverrideEnabled: boolean; payMode: DriverPayMode | null; dailyRate: Prisma.Decimal | null;
  payFixedAmount: Prisma.Decimal | null; payPercentage: Prisma.Decimal | null;
  payRateTable: Prisma.JsonValue; payFailedAttempt: boolean | null;
};

@Injectable()
export class DriverEarningsService {
  constructor(private readonly prisma: PrismaService) {}

  private tiers(value: Prisma.JsonValue): DriverPayRateTierDTO[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const upToKm = 'upToKm' in item ? item.upToKm : null;
      const amount = 'amount' in item ? item.amount : null;
      return [(upToKm === null || typeof upToKm === 'number') && typeof amount === 'number'
        ? { upToKm, amount } : null].filter((tier): tier is DriverPayRateTierDTO => tier !== null);
    });
  }

  private validate(input: UpdateDriverPaySettingsDTO) {
    if (input.rateTable.some((tier) => tier.amount < 0 || (tier.upToKm !== null && tier.upToKm <= 0))) {
      throw new BadRequestException('A tabela do entregador possui faixa invÃ¡lida.');
    }
    const finite = input.rateTable.filter((tier) => tier.upToKm !== null).map((tier) => tier.upToKm as number);
    if (finite.some((limit, index) => index > 0 && limit <= finite[index - 1])) {
      throw new BadRequestException('As faixas de distÃ¢ncia devem estar em ordem crescente.');
    }
    if (input.mode === DriverPayMode.DRIVER_RATE_TABLE && input.rateTable.at(-1)?.upToKm !== null) {
      throw new BadRequestException('A Ãºltima faixa deve cobrir distÃ¢ncias acima do limite.');
    }
  }

  async getSettings(tenantId: string): Promise<DriverPaySettingsDTO> {
    const row = await this.prisma.tenantSettings.findUnique({ where: { tenantId } });
    return {
      mode: SharedDriverPayMode[row?.driverPayMode ?? DriverPayMode.FIXED],
      dailyRate: Number(row?.driverDailyRate ?? 0), fixedAmount: Number(row?.driverPayFixedAmount ?? 0),
      percentage: Number(row?.driverPayPercentage ?? 100), rateTable: this.tiers(row?.driverPayRateTable ?? null),
      payFailedAttempt: row?.driverPayFailedAttempt ?? false, currency: row?.currency ?? 'BRL',
    };
  }

  async updateSettings(tenantId: string, actorId: string, input: UpdateDriverPaySettingsDTO) {
    this.validate(input);
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.tenantSettings.findUnique({ where: { tenantId } });
      await tx.tenantSettings.upsert({
        where: { tenantId },
        create: { tenantId, driverPayMode: input.mode, driverDailyRate: input.dailyRate,
          driverPayFixedAmount: input.fixedAmount, driverPayPercentage: input.percentage,
          driverPayRateTable: input.rateTable.map((tier) => ({ upToKm: tier.upToKm, amount: tier.amount })),
          driverPayFailedAttempt: input.payFailedAttempt },
        update: { driverPayMode: input.mode, driverDailyRate: input.dailyRate,
          driverPayFixedAmount: input.fixedAmount, driverPayPercentage: input.percentage,
          driverPayRateTable: input.rateTable.map((tier) => ({ upToKm: tier.upToKm, amount: tier.amount })),
          driverPayFailedAttempt: input.payFailedAttempt },
      });
      await tx.auditLog.create({ data: { tenantId, userId: actorId, userType: 'tenant_user',
        action: 'tenant.driver_pay_settings.update', resource: 'tenant_settings',
        details: { before: before ? { mode: before.driverPayMode, dailyRate: Number(before.driverDailyRate) } : null,
          after: { mode: input.mode, dailyRate: input.dailyRate } } } });
    });
    return this.getSettings(tenantId);
  }

  private resolve(driver: PaySource, settings: {
    driverPayMode: DriverPayMode; driverDailyRate: Prisma.Decimal; driverPayFixedAmount: Prisma.Decimal;
    driverPayPercentage: Prisma.Decimal; driverPayRateTable: Prisma.JsonValue; driverPayFailedAttempt: boolean; currency: string;
  }) {
    const override = driver.payOverrideEnabled;
    return {
      mode: override && driver.payMode ? driver.payMode : settings.driverPayMode,
      dailyRate: override && driver.dailyRate !== null ? driver.dailyRate : settings.driverDailyRate,
      fixed: override && driver.payFixedAmount !== null ? driver.payFixedAmount : settings.driverPayFixedAmount,
      percentage: override && driver.payPercentage !== null ? driver.payPercentage : settings.driverPayPercentage,
      table: override && driver.payRateTable !== null ? driver.payRateTable : settings.driverPayRateTable,
      payAttempt: override && driver.payFailedAttempt !== null ? driver.payFailedAttempt : settings.driverPayFailedAttempt,
      currency: settings.currency,
    };
  }

  async shiftSnapshot(tx: Tx, tenantId: string, driver: PaySource) {
    const settings = await tx.tenantSettings.findUniqueOrThrow({ where: { tenantId } });
    const pay = this.resolve(driver, settings);
    return { dailyRateSnapshot: pay.dailyRate, currencySnapshot: pay.currency, paySnapshotAt: new Date() };
  }

  stopSnapshot(driver: PaySource, settings: Parameters<DriverEarningsService['resolve']>[1], order: {
    normalDeliveryFee: Prisma.Decimal; deliveryLat: number | null; deliveryLng: number | null;
  }, origin: { lat: number | null; lng: number | null }) {
    const pay = this.resolve(driver, settings);
    const distance = origin.lat !== null && origin.lng !== null && order.deliveryLat !== null && order.deliveryLng !== null
      ? this.distanceKm(origin.lat, origin.lng, order.deliveryLat, order.deliveryLng) : null;
    const base = order.normalDeliveryFee;
    let amount = new Prisma.Decimal(0);
    if (pay.mode === DriverPayMode.NORMAL_DELIVERY_FEE) amount = base;
    if (pay.mode === DriverPayMode.PERCENTAGE_NORMAL_FEE) amount = base.mul(pay.percentage).div(100);
    if (pay.mode === DriverPayMode.FIXED) amount = pay.fixed;
    if (pay.mode === DriverPayMode.DRIVER_RATE_TABLE) {
      if (distance === null) throw new BadRequestException('A tabela por distÃ¢ncia exige coordenadas da loja e do pedido.');
      const tier = this.tiers(pay.table).find((item) => item.upToKm === null || distance <= item.upToKm);
      if (!tier) throw new BadRequestException('A tabela do entregador nÃ£o cobre esta distÃ¢ncia.');
      amount = new Prisma.Decimal(tier.amount);
    }
    return { payModeSnapshot: pay.mode, payBaseSnapshot: base, payPercentageSnapshot: pay.percentage,
      payFixedSnapshot: pay.fixed, payRateTableSnapshot: pay.table ?? Prisma.JsonNull,
      payDistanceKmSnapshot: distance, payAmountSnapshot: amount.toDecimalPlaces(2),
      payCurrencySnapshot: pay.currency, payAttemptSnapshot: pay.payAttempt, paySnapshotAt: new Date() };
  }

  private distanceKm(aLat: number, aLng: number, bLat: number, bLng: number) {
    const rad = (value: number) => value * Math.PI / 180;
    const dLat = rad(bLat - aLat); const dLng = rad(bLng - aLng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  async postStop(tx: Tx, stop: { id: string; tenantId: string; orderId: string; runId: string;
    arrivedAt: Date | null; payAmountSnapshot: Prisma.Decimal | null; payCurrencySnapshot: string | null;
    run: { driverId: string; shiftId: string } }, source: 'delivered' | 'attempt' | 'cancelled', payAttempt: boolean) {
    if (!stop.payAmountSnapshot || (source !== 'delivered' && (!stop.arrivedAt || !payAttempt))) return;
    await tx.driverLedgerEntry.createMany({ skipDuplicates: true, data: [{ tenantId: stop.tenantId,
      driverId: stop.run.driverId, shiftId: stop.run.shiftId, runId: stop.runId, stopId: stop.id,
      orderId: stop.orderId, type: DriverLedgerEntryType.DELIVERY_FEE, amount: stop.payAmountSnapshot,
      currency: stop.payCurrencySnapshot ?? 'BRL', receivedDirectlyByDriver: false,
      source: source === 'delivered' ? 'delivery_stop' : 'failed_attempt', sourceKey: `stop-pay:${stop.id}` }] });
  }

  async postDailyRate(tx: Tx, shift: { id: string; tenantId: string; driverId: string;
    dailyRateSnapshot: Prisma.Decimal; currencySnapshot: string }) {
    await tx.driverLedgerEntry.createMany({ skipDuplicates: true, data: [{ tenantId: shift.tenantId,
      driverId: shift.driverId, shiftId: shift.id, type: DriverLedgerEntryType.DAILY_RATE,
      amount: shift.dailyRateSnapshot, currency: shift.currencySnapshot, receivedDirectlyByDriver: false,
      source: 'shift_close', sourceKey: `daily-rate:${shift.id}` }] });
  }

  async summary(tenantId: string, driverId: string, shiftId?: string): Promise<DriverEarningsSummaryDTO> {
    const shift = shiftId ? await this.prisma.driverShift.findFirst({ where: { id: shiftId, tenantId, driverId } })
      : await this.prisma.driverShift.findFirst({ where: { tenantId, driverId }, orderBy: { startedAt: 'desc' } });
    if (!shift) throw new NotFoundException('Turno nÃ£o encontrado.');
    const entries = await this.prisma.driverLedgerEntry.findMany({ where: { tenantId, driverId, shiftId: shift.id } });
    const sum = (type: DriverLedgerEntryType) => entries.filter((e) => e.type === type).reduce((v, e) => v + Number(e.amount), 0);
    const dailyPosted = sum(DriverLedgerEntryType.DAILY_RATE); const dailyRate = dailyPosted || Number(shift.dailyRateSnapshot);
    const deliveryFees = sum(DriverLedgerEntryType.DELIVERY_FEE); const cashTips = sum(DriverLedgerEntryType.TIP_CASH);
    const adjustments = sum(DriverLedgerEntryType.ADJUSTMENT) + sum(DriverLedgerEntryType.BONUS);
    const receivedDirectly = entries.filter((e) => e.receivedDirectlyByDriver).reduce((v, e) => v + Number(e.amount), 0);
    const totalEarnings = deliveryFees + cashTips + dailyRate + adjustments;
    return { shiftId: shift.id, shiftStatus: SharedDriverShiftStatus[shift.status], deliveryFees, cashTips, dailyRate,
      dailyRatePreview: shift.status === 'ACTIVE' && !dailyPosted, adjustments, totalEarnings,
      receivedDirectly, dueFromStore: totalEarnings - receivedDirectly, currency: shift.currencySnapshot };
  }

  async addCashTip(tenantId: string, driverId: string, orderId: string, amount: number,
    actorId: string, actorType: 'delivery_driver' | 'tenant_user') {
    const stop = await this.prisma.deliveryStop.findFirst({ where: { tenantId, orderId,
      run: { driverId }, status: { in: ['ARRIVED', 'DELIVERED', 'RETURN_TO_STORE', 'RETURNED_TO_STORE'] } },
      include: { run: true } });
    if (!stop) throw new BadRequestException('A gorjeta sÃ³ pode ser registrada para um pedido atendido por este entregador.');
    const sourceKey = `cash-tip:${stop.id}:${actorType}:${actorId}:${amount.toFixed(2)}`;
    await this.prisma.driverLedgerEntry.createMany({ skipDuplicates: true, data: [{ tenantId, driverId,
      shiftId: stop.run.shiftId, runId: stop.runId, stopId: stop.id, orderId, type: DriverLedgerEntryType.TIP_CASH,
      amount, currency: stop.payCurrencySnapshot ?? 'BRL', receivedDirectlyByDriver: true,
      source: 'cash_tip', sourceKey, createdBy: actorId, createdByType: actorType }] });
    return this.summary(tenantId, driverId, stop.run.shiftId);
  }

  async addAdjustment(tenantId: string, driverId: string, amount: number, reason: string, actorId: string) {
    if (!amount || !reason.trim()) throw new BadRequestException('Informe valor e motivo da correÃ§Ã£o.');
    const shift = await this.prisma.driverShift.findFirst({ where: { tenantId, driverId }, orderBy: { startedAt: 'desc' } });
    if (!shift) throw new NotFoundException('Turno do entregador nÃ£o encontrado.');
    await this.prisma.driverLedgerEntry.create({ data: { tenantId, driverId, shiftId: shift.id,
      type: DriverLedgerEntryType.ADJUSTMENT, amount, currency: shift.currencySnapshot,
      receivedDirectlyByDriver: false, source: 'manager_adjustment',
      sourceKey: `adjustment:${crypto.randomUUID()}`, reason: reason.trim(), createdBy: actorId, createdByType: 'tenant_user' } });
    return this.summary(tenantId, driverId, shift.id);
  }
}
