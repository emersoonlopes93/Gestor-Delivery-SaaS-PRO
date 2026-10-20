import { Prisma, UnitType } from '@prisma/client';
import {
  convertUnitQuantity,
  getUnitDimension,
  UnitConversionError,
  UnitDimension,
} from './unit-conversion';

const decimal = (value: string) => new Prisma.Decimal(value);

describe('unit conversion registry', () => {
  it.each([
    ['1 l to ml', '1', UnitType.l, UnitType.ml, '1000'],
    ['1000 ml to l', '1000', UnitType.ml, UnitType.l, '1'],
    ['0.350 l to ml', '0.350', UnitType.l, UnitType.ml, '350'],
    ['350 ml to l', '350', UnitType.ml, UnitType.l, '0.35'],
    ['1 kg to g', '1', UnitType.kg, UnitType.g, '1000'],
    ['1000 g to kg', '1000', UnitType.g, UnitType.kg, '1'],
    ['0.030 kg to g', '0.030', UnitType.kg, UnitType.g, '30'],
    ['30 g to kg', '30', UnitType.g, UnitType.kg, '0.03'],
    ['0.1 l to ml', '0.1', UnitType.l, UnitType.ml, '100'],
    ['0.333 l to ml', '0.333', UnitType.l, UnitType.ml, '333'],
  ] as const)('%s uses Decimal arithmetic without rounding', (_label, quantity, from, to, expected) => {
    const converted = convertUnitQuantity(decimal(quantity), from, to);
    expect(converted).toBeInstanceOf(Prisma.Decimal);
    expect(converted.toString()).toBe(expected);
  });

  it.each([UnitType.un, UnitType.g, UnitType.kg, UnitType.ml, UnitType.l])(
    'preserves %s in identity conversion',
    (unit) => {
      expect(convertUnitQuantity(decimal('12.345678'), unit, unit).toString()).toBe('12.345678');
    },
  );

  it('derives dimensions without persisting them', () => {
    expect(getUnitDimension(UnitType.un)).toBe(UnitDimension.COUNT);
    expect(getUnitDimension(UnitType.g)).toBe(UnitDimension.MASS);
    expect(getUnitDimension(UnitType.kg)).toBe(UnitDimension.MASS);
    expect(getUnitDimension(UnitType.ml)).toBe(UnitDimension.VOLUME);
    expect(getUnitDimension(UnitType.l)).toBe(UnitDimension.VOLUME);
  });

  it.each([
    [UnitType.l, UnitType.kg],
    [UnitType.kg, UnitType.l],
    [UnitType.ml, UnitType.g],
    [UnitType.g, UnitType.ml],
    [UnitType.un, UnitType.g],
    [UnitType.g, UnitType.un],
    [UnitType.un, UnitType.ml],
  ])('rejects incompatible dimensions from %s to %s', (from, to) => {
    let thrown: unknown;
    try {
      convertUnitQuantity(decimal('1'), from, to);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(UnitConversionError);
    expect(thrown).toMatchObject({ code: 'INCOMPATIBLE_UNIT_DIMENSIONS' });
  });

  it('permits zero and negative quantities as pure mathematical values', () => {
    expect(convertUnitQuantity(decimal('0'), UnitType.kg, UnitType.g).toString()).toBe('0');
    expect(convertUnitQuantity(decimal('-0.5'), UnitType.l, UnitType.ml).toString()).toBe('-500');
  });
});
