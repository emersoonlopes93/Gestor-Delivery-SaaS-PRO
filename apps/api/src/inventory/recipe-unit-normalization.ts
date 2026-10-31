import { BadRequestException } from '@nestjs/common';
import { Prisma, UnitType } from '@prisma/client';
import { convertUnitQuantity, UnitConversionError } from './unit-conversion';

const DECIMAL_INPUT = /^\d+(\.\d{1,6})?$/;

/** Normalizes tenant-authored recipe quantities without creating another unit registry. */
export function normalizeRecipeQuantity(
  inputQuantity: unknown,
  inputUnit: UnitType,
  targetUnit: UnitType,
): Prisma.Decimal {
  const text = typeof inputQuantity === 'number' || typeof inputQuantity === 'string'
    ? String(inputQuantity)
    : '';
  if (!DECIMAL_INPUT.test(text)) {
    throw new BadRequestException('Quantidade deve ser positiva e ter no máximo 6 casas decimais.');
  }
  const quantity = new Prisma.Decimal(text);
  if (!quantity.isFinite() || quantity.lte(0)) {
    throw new BadRequestException('Quantidade deve ser positiva e ter no máximo 6 casas decimais.');
  }
  try {
    return convertUnitQuantity(quantity, inputUnit, targetUnit);
  } catch (error) {
    if (error instanceof UnitConversionError) {
      throw new BadRequestException('A unidade informada não é compatível com a unidade-base do componente.');
    }
    throw error;
  }
}
