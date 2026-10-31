import { Injectable, NotFoundException } from '@nestjs/common';
import { HistoricalCmvCoverage, HistoricalCostEvidence, Prisma, StockMovementType } from '@prisma/client';
import { HistoricalOrderCmvDTO } from '@gestor/types';
import { PrismaService } from '../database/prisma.service';

const MONEY_SCALE = 2;

@Injectable()
export class HistoricalCmvService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reads immutable theoretical movements only. It intentionally does not
   * consult current recipes, current ingredient costs, purchases or BI data.
   */
  async getOrderCmv(tenantId: string, orderId: string): Promise<HistoricalOrderCmvDTO> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
      select: { id: true },
    });
    if (!order) throw new NotFoundException('Pedido nao encontrado.');

    const movements = await this.prisma.stockMovement.findMany({
      where: { tenantId, orderId, type: StockMovementType.theoretical_depletion },
      include: { reversal: { select: { id: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    if (!movements.length) {
      return this.result(orderId, 'UNKNOWN', new Prisma.Decimal(0), null, ['NO_THEORETICAL_DEPLETION'], []);
    }

    const active = movements.filter((movement) => movement.reversal === null);
    const line = (movement: typeof movements[number]) => {
      const isKnown = movement.costEvidence === HistoricalCostEvidence.known && movement.unitCost !== null;
      return {
        ingredientId: movement.ingredientId,
        quantity: movement.quantity.toString(),
        unitCost: movement.unitCost?.toString() ?? null,
        lineCost: isKnown ? movement.quantity.mul(movement.unitCost as Prisma.Decimal).toString() : null,
        movementId: movement.id,
        isActive: movement.reversal === null,
        ...(movement.reversal ? { reversalMovementId: movement.reversal.id } : {}),
        costEvidence: isKnown ? 'KNOWN' as const : 'UNKNOWN' as const,
      };
    };

    const knownSubtotal = active.reduce((total, movement) => {
      if (movement.costEvidence !== HistoricalCostEvidence.known || movement.unitCost === null) return total;
      return total.plus(movement.quantity.mul(movement.unitCost));
    }, new Prisma.Decimal(0));

    if (!active.length) {
      const reversalCoverageKnown = movements.every((movement) =>
        movement.reversal !== null
        && movement.costEvidence === HistoricalCostEvidence.known
        && movement.orderCmvCoverage === HistoricalCmvCoverage.known,
      );
      return reversalCoverageKnown
        ? this.result(orderId, 'KNOWN', new Prisma.Decimal(0), new Prisma.Decimal(0), ['FULLY_REVERSED'], movements.map(line))
        : this.result(orderId, 'UNKNOWN', new Prisma.Decimal(0), null, ['REVERSED_LEGACY_OR_INCOMPLETE_COVERAGE'], movements.map(line));
    }

    const hasPartialCoverage = active.some((movement) => movement.orderCmvCoverage !== HistoricalCmvCoverage.known);
    const hasUnknownCost = active.some((movement) => movement.costEvidence !== HistoricalCostEvidence.known || movement.unitCost === null);
    if (!hasPartialCoverage && !hasUnknownCost) {
      return this.result(orderId, 'KNOWN', knownSubtotal, knownSubtotal, [], movements.map(line));
    }

    const reasons = [
      ...(hasPartialCoverage ? ['INCOMPLETE_ORDER_COVERAGE'] : []),
      ...(hasUnknownCost ? ['MISSING_COST_PROVENANCE'] : []),
    ];
    const status = knownSubtotal.isZero() ? 'UNKNOWN' : 'PARTIAL';
    return this.result(orderId, status, knownSubtotal, null, reasons, movements.map(line));
  }

  private result(
    orderId: string,
    coverageStatus: HistoricalOrderCmvDTO['coverageStatus'],
    knownSubtotal: Prisma.Decimal,
    totalCmv: Prisma.Decimal | null,
    coverageReasons: string[],
    ingredients: HistoricalOrderCmvDTO['ingredients'],
  ): HistoricalOrderCmvDTO {
    return {
      orderId,
      coverageStatus,
      knownSubtotal: knownSubtotal.toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP).toFixed(MONEY_SCALE),
      totalCmv: totalCmv === null ? null : totalCmv.toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP).toFixed(MONEY_SCALE),
      coverageReasons,
      ingredients,
    };
  }
}
