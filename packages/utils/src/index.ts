/**
 * Generates a slug from a string.
 * Converts to lowercase, replaces spaces/special chars with hyphens.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

/**
 * Formats a date to ISO string safely.
 */
export function toISOString(date: Date | string): string {
  if (typeof date === 'string') return new Date(date).toISOString();
  return date.toISOString();
}

/**
 * Checks if a value is null or undefined.
 */
export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Creates a pagination object from count and params.
 */
export function buildPagination(total: number, page: number, pageSize: number) {
  const totalPages = Math.ceil(total / pageSize);
  return {
    total,
    page,
    pageSize,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
  };
}

/**
 * Generates a random ID for temporary objects (cart lines, etc).
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// ============================================================================
// MASKS & FORMATTERS
// ============================================================================

/**
 * Removes all non-digit characters from a string.
 */
export function unmask(value: string | undefined | null): string {
  if (!value) return '';
  return value.replace(/\D/g, '');
}

/**
 * Masks a phone number: (00) 0000-0000 or (00) 00000-0000
 */
export function maskPhone(value: string | undefined | null): string {
  const digits = unmask(value);
  if (!digits) return '';

  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2')
      .substring(0, 14);
  }
  
  return digits
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .substring(0, 15);
}

/**
 * Masks a CEP: 00000-000
 */
export function maskCEP(value: string | undefined | null): string {
  const digits = unmask(value);
  if (!digits) return '';

  return digits
    .replace(/(\d{5})(\d)/, '$1-$2')
    .substring(0, 9);
}

/**
 * Masks a CPF (000.000.000-00) or CNPJ (00.000.000/0000-00) dynamically.
 */
export function maskCPFCNPJ(value: string | undefined | null): string {
  const digits = unmask(value);
  if (!digits) return '';

  if (digits.length <= 11) {
    // CPF
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
      .substring(0, 14);
  }
  
  // CNPJ
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
    .substring(0, 18);
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value);
}

function parseCurrencyString(value: string): number {
  const normalized = value.trim();
  if (!normalized) return 0;

  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');
  let numeric = normalized.replace(/[^\d,.-]/g, '');

  if (hasComma && hasDot) {
    numeric = numeric.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    numeric = numeric.replace(',', '.');
  }

  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function currencyDigitsToNumber(value: string | undefined | null): number {
  const digits = unmask(value);
  if (!digits) return 0;
  return parseInt(digits, 10) / 100;
}

export function currencyNumberToDigits(value: number | undefined | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '0';
  return Math.round(value * 100).toString();
}

/**
 * Masks a BRL currency value where the domain value is already in reais.
 * Examples: 45 -> "R$ 45,00" | 0.45 -> "R$ 0,45"
 */
export function maskCurrency(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return 'R$ 0,00';
  const numericValue = typeof value === 'number' ? value : parseCurrencyString(value);
  return formatBRL(Number.isFinite(numericValue) ? numericValue : 0);
}

/**
 * Converts the editable masked string to a number in reais.
 * "R$ 1,00" -> 1.00 | "4500" -> 45.00 while typing
 */
export function unmaskCurrency(value: string | undefined | null): number {
  return currencyDigitsToNumber(value);
}

export * from './google-maps-address';
export * from './pizza';

