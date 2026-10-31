import { Prisma } from '@prisma/client';

const MONEY_SCALE = 4;

/** Calculates weighted-average cost with database decimals only. */
export function weightedAverageCost(
  currentStock: Prisma.Decimal,
  currentCost: Prisma.Decimal,
  incomingQuantity: Prisma.Decimal,
  incomingUnitCost: Prisma.Decimal,
): Prisma.Decimal {
  const resultingStock = currentStock.plus(incomingQuantity);
  if (resultingStock.lessThanOrEqualTo(0)) return currentCost;
  if (currentStock.lessThanOrEqualTo(0)) {
    return incomingUnitCost.toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
  }
  return currentStock.mul(currentCost).plus(incomingQuantity.mul(incomingUnitCost))
    .div(resultingStock).toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
}

/** A zero stock balance retains the last valid cost as a reference. */
export function reversalAverageCost(
  currentStock: Prisma.Decimal,
  currentCost: Prisma.Decimal,
  reversalQuantity: Prisma.Decimal,
  reversalValue: Prisma.Decimal,
): Prisma.Decimal {
  const remainingStock = currentStock.minus(reversalQuantity);
  const remainingValue = currentStock.mul(currentCost).minus(reversalValue);
  if (remainingStock.lessThan(0) || remainingValue.lessThan(0)) {
    throw new Error('UNRECONCILABLE_REVERSAL_VALUE');
  }
  if (remainingStock.isZero()) return currentCost;
  return remainingValue.div(remainingStock).toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_HALF_UP);
}
