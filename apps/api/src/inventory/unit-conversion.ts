import { Prisma, UnitType } from '@prisma/client';

export enum UnitDimension {
  COUNT = 'COUNT',
  MASS = 'MASS',
  VOLUME = 'VOLUME',
}

export type UnitConversionErrorCode =
  | 'INCOMPATIBLE_UNIT_DIMENSIONS'
  | 'UNSUPPORTED_UNIT'
  | 'INVALID_QUANTITY';

export class UnitConversionError extends Error {
  constructor(
    public readonly code: UnitConversionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'UnitConversionError';
  }
}

type UnitMetadata = {
  dimension: UnitDimension;
  scaleToDimensionReference: Prisma.Decimal;
};

const unitMetadata: Readonly<Record<UnitType, UnitMetadata>> = {
  [UnitType.un]: {
    dimension: UnitDimension.COUNT,
    scaleToDimensionReference: new Prisma.Decimal(1),
  },
  [UnitType.g]: {
    dimension: UnitDimension.MASS,
    scaleToDimensionReference: new Prisma.Decimal(1),
  },
  [UnitType.kg]: {
    dimension: UnitDimension.MASS,
    scaleToDimensionReference: new Prisma.Decimal(1000),
  },
  [UnitType.ml]: {
    dimension: UnitDimension.VOLUME,
    scaleToDimensionReference: new Prisma.Decimal(1),
  },
  [UnitType.l]: {
    dimension: UnitDimension.VOLUME,
    scaleToDimensionReference: new Prisma.Decimal(1000),
  },
};

function metadataFor(unit: UnitType): UnitMetadata {
  const metadata = unitMetadata[unit];
  if (!metadata) {
    throw new UnitConversionError('UNSUPPORTED_UNIT', `Unsupported unit: ${String(unit)}.`);
  }
  return metadata;
}

/**
 * Classifies persisted units without storing a second dimension field.
 */
export function getUnitDimension(unit: UnitType): UnitDimension {
  return metadataFor(unit).dimension;
}

/**
 * Converts quantities only within one physical dimension.
 *
 * Negative quantities are intentionally supported by this mathematical core;
 * operational writers remain responsible for allowing or rejecting reversals.
 * The conversion deliberately does not round.
 */
export function convertUnitQuantity(
  quantity: Prisma.Decimal,
  fromUnit: UnitType,
  toUnit: UnitType,
): Prisma.Decimal {
  if (!quantity.isFinite()) {
    throw new UnitConversionError('INVALID_QUANTITY', 'Unit conversion requires a finite quantity.');
  }

  const source = metadataFor(fromUnit);
  const target = metadataFor(toUnit);
  if (source.dimension !== target.dimension) {
    throw new UnitConversionError(
      'INCOMPATIBLE_UNIT_DIMENSIONS',
      `Cannot convert ${source.dimension} to ${target.dimension}.`,
    );
  }

  return quantity.mul(source.scaleToDimensionReference).div(target.scaleToDimensionReference);
}
