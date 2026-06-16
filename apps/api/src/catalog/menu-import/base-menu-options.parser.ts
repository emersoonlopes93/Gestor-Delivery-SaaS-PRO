import { OptionSelectionType, PriceImpactType, PricingAxis, Prisma } from '@prisma/client';

export type ParsedBaseMenuOptionItem = {
  slug: string;
  name: string;
  description: string | null;
  priceImpactType: PriceImpactType;
  priceImpactValue: Prisma.Decimal;
  allowQuantity: boolean;
  minQty: number | null;
  maxQty: number | null;
  order: number;
};

export type ParsedBaseMenuOptionGroup = {
  slug: string;
  name: string;
  description: string | null;
  selectionType: OptionSelectionType;
  isRequired: boolean;
  minSelect: number;
  maxSelect: number;
  order: number;
  pricingAxis: PricingAxis;
  overrideName: string | null;
  overrideDescription: string | null;
  overrideIsRequired: boolean | null;
  overrideMinSelect: number | null;
  overrideMaxSelect: number | null;
  items: ParsedBaseMenuOptionItem[];
};

const SELECTION_TYPES = new Set<string>(Object.values(OptionSelectionType));
const PRICE_IMPACT_TYPES = new Set<string>(Object.values(PriceImpactType));
const PRICING_AXES = new Set<string>(Object.values(PricingAxis));

export function parseBaseMenuProductOptionGroups(metadataJson: unknown): ParsedBaseMenuOptionGroup[] {
  if (metadataJson === null || metadataJson === undefined) return [];
  const metadata = asRecord(metadataJson, 'metadataJson');
  const optionGroups = metadata.optionGroups;
  if (optionGroups === undefined || optionGroups === null) return [];
  if (!Array.isArray(optionGroups)) {
    throw new Error('metadataJson.optionGroups deve ser um array.');
  }

  return optionGroups.map((group, groupIndex) => parseOptionGroup(group, groupIndex));
}

export function normalizeBaseMenuOptionSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseOptionGroup(value: unknown, index: number): ParsedBaseMenuOptionGroup {
  const path = `metadataJson.optionGroups[${index}]`;
  const input = asRecord(value, path);
  const name = requiredString(input.name, `${path}.name`, 140);
  const slug = optionalSlug(input.slug, name, `${path}.slug`);
  const selectionType = enumValue<OptionSelectionType>(input.selectionType, `${path}.selectionType`, SELECTION_TYPES, OptionSelectionType.multiple);
  const isRequired = optionalBoolean(input.isRequired, false, `${path}.isRequired`);
  const minSelect = optionalNonNegativeInt(input.minSelect, isRequired ? 1 : 0, `${path}.minSelect`);
  const maxSelect = optionalNonNegativeInt(input.maxSelect, selectionType === OptionSelectionType.single ? 1 : 1, `${path}.maxSelect`);
  const effectiveMinSelect = isRequired ? Math.max(1, minSelect) : minSelect;

  if (maxSelect === 0) throw new Error(`${path}.maxSelect deve ser maior que 0.`);
  if (maxSelect < effectiveMinSelect) throw new Error(`${path}.maxSelect nao pode ser menor que minSelect.`);
  if (isRequired && effectiveMinSelect < 1) throw new Error(`${path}.isRequired=true exige minSelect >= 1.`);
  if (selectionType === OptionSelectionType.single && maxSelect !== 1) {
    throw new Error(`${path}.selectionType=single exige maxSelect=1.`);
  }
  if (selectionType === OptionSelectionType.quantity && maxSelect < 1) {
    throw new Error(`${path}.selectionType=quantity exige maxSelect>=1.`);
  }

  if (!Array.isArray(input.items)) throw new Error(`${path}.items deve ser um array.`);
  if (input.items.length === 0) throw new Error(`${path}.items deve conter ao menos um item.`);

  return {
    slug,
    name,
    description: optionalString(input.description, `${path}.description`, 1000),
    selectionType,
    isRequired,
    minSelect: effectiveMinSelect,
    maxSelect,
    order: optionalNonNegativeInt(input.order, index + 1, `${path}.order`),
    pricingAxis: enumValue<PricingAxis>(input.pricingAxis, `${path}.pricingAxis`, PRICING_AXES, PricingAxis.secondary),
    overrideName: optionalString(input.overrideName, `${path}.overrideName`, 140),
    overrideDescription: optionalString(input.overrideDescription, `${path}.overrideDescription`, 1000),
    overrideIsRequired: optionalBooleanOrNull(input.overrideIsRequired, `${path}.overrideIsRequired`),
    overrideMinSelect: optionalIntOrNull(input.overrideMinSelect, `${path}.overrideMinSelect`),
    overrideMaxSelect: optionalIntOrNull(input.overrideMaxSelect, `${path}.overrideMaxSelect`),
    items: input.items.map((item, itemIndex) => parseOptionItem(item, itemIndex, path)),
  };
}

function parseOptionItem(value: unknown, index: number, groupPath: string): ParsedBaseMenuOptionItem {
  const path = `${groupPath}.items[${index}]`;
  const input = asRecord(value, path);
  const name = requiredString(input.name, `${path}.name`, 140);
  const slug = optionalSlug(input.slug, name, `${path}.slug`);
  const fallbackImpactType = hasPositivePriceImpactValue(input.priceImpactValue) ? PriceImpactType.fixed : PriceImpactType.none;
  const priceImpactType = enumValue<PriceImpactType>(input.priceImpactType, `${path}.priceImpactType`, PRICE_IMPACT_TYPES, fallbackImpactType);
  const priceImpactValue = decimalMoney(input.priceImpactValue, `${path}.priceImpactValue`, priceImpactType === PriceImpactType.none ? 0 : undefined);
  const allowQuantity = optionalBoolean(input.allowQuantity, false, `${path}.allowQuantity`);
  const minQty = optionalPositiveIntOrNull(input.minQty, `${path}.minQty`);
  const maxQty = optionalPositiveIntOrNull(input.maxQty, `${path}.maxQty`);

  if (priceImpactType === PriceImpactType.percentage && (priceImpactValue.lessThan(0) || priceImpactValue.greaterThan(100))) {
    throw new Error(`${path}.priceImpactValue percentage deve estar entre 0 e 100.`);
  }
  if (priceImpactType !== PriceImpactType.percentage && priceImpactValue.lessThan(0)) {
    throw new Error(`${path}.priceImpactValue nao pode ser negativo.`);
  }
  if (allowQuantity && minQty !== null && maxQty !== null && minQty > maxQty) {
    throw new Error(`${path}.minQty nao pode ser maior que maxQty.`);
  }

  return {
    slug,
    name,
    description: optionalString(input.description, `${path}.description`, 1000),
    priceImpactType,
    priceImpactValue,
    allowQuantity,
    minQty: allowQuantity ? minQty : null,
    maxQty: allowQuantity ? maxQty : null,
    order: optionalNonNegativeInt(input.order, index + 1, `${path}.order`),
  };
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} deve ser um objeto JSON.`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, path: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${path} e obrigatorio.`);
  const text = value.trim();
  if (text.length > maxLength) throw new Error(`${path} excede ${maxLength} caracteres.`);
  return text;
}

function optionalString(value: unknown, path: string, maxLength: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error(`${path} deve ser texto.`);
  const text = value.trim();
  if (text.length > maxLength) throw new Error(`${path} excede ${maxLength} caracteres.`);
  return text || null;
}

function optionalSlug(value: unknown, fallbackName: string, path: string): string {
  const source = value === undefined || value === null || value === '' ? fallbackName : requiredString(value, path, 120);
  const slug = normalizeBaseMenuOptionSlug(source);
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error(`${path} invalido.`);
  return slug;
}

function enumValue<T extends string>(value: unknown, path: string, allowed: Set<string>, fallback: T): T {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !allowed.has(value)) throw new Error(`${path} invalido.`);
  return value as T;
}

function optionalBoolean(value: unknown, fallback: boolean, path: string): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') throw new Error(`${path} deve ser booleano.`);
  return value;
}

function optionalBooleanOrNull(value: unknown, path: string): boolean | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'boolean') throw new Error(`${path} deve ser booleano.`);
  return value;
}

function optionalNonNegativeInt(value: unknown, fallback: number, path: string): number {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${path} deve ser inteiro maior ou igual a zero.`);
  }
  return value;
}

function optionalIntOrNull(value: unknown, path: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${path} deve ser inteiro maior ou igual a zero.`);
  }
  return value;
}

function optionalPositiveIntOrNull(value: unknown, path: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`${path} deve ser inteiro maior ou igual a um.`);
  }
  return value;
}

function decimalMoney(value: unknown, path: string, fallback?: number): Prisma.Decimal {
  if (value === undefined || value === null || value === '') {
    if (fallback === undefined) throw new Error(`${path} e obrigatorio.`);
    return new Prisma.Decimal(fallback);
  }
  if (typeof value !== 'number' && typeof value !== 'string') throw new Error(`${path} deve ser numerico.`);
  try {
    return new Prisma.Decimal(value);
  } catch (error) {
    throw new Error(`${path} deve ser Decimal compativel.`);
  }
}

function hasPositivePriceImpactValue(value: unknown): boolean {
  if (typeof value !== 'number' && typeof value !== 'string') return false;
  try {
    return new Prisma.Decimal(value).greaterThan(0);
  } catch (error) {
    return false;
  }
}
