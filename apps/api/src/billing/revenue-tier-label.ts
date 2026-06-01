import { Prisma } from '@prisma/client';

type DecimalInput = Prisma.Decimal | number | string | null;

function toNumber(value: DecimalInput): number | null {
  if (value === null) return null;
  if (value instanceof Prisma.Decimal) return value.toNumber();
  return Number(value);
}

function formatCurrency(value: DecimalInput): string {
  const amount = toNumber(value) ?? 0;
  return amount.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function formatRevenueTierLabel(input: {
  minRevenue: DecimalInput;
  maxRevenue: DecimalInput;
}): string {
  const minRevenue = toNumber(input.minRevenue) ?? 0;
  if (input.maxRevenue === null) {
    return `Acima de ${formatCurrency(input.minRevenue)}`;
  }
  if (minRevenue === 0) {
    return `Até ${formatCurrency(input.maxRevenue)}`;
  }
  return `${formatCurrency(input.minRevenue)} até ${formatCurrency(input.maxRevenue)}`;
}

export function normalizeSeededRevenueTierLabel(input: {
  label: string | null;
  minRevenue: DecimalInput;
  maxRevenue: DecimalInput;
}): string | null {
  if (!input.label?.trim()) return input.label;
  const label = input.label.trim();
  const generated = formatRevenueTierLabel(input);
  const asciiGenerated = generated.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (label === asciiGenerated || label.includes('Ate ') || label.includes(' ate ')) {
    return generated;
  }

  return label;
}
