export type Food99OrderStatus = 'CREATED' | 'CONFIRMED' | 'DISPATCHED' | 'COURIER_AT_CUSTOMER' | 'COMPLETED' | 'CANCELLED';

const STATUS_BY_CODE: Readonly<Record<number, Food99OrderStatus>> = {
  100: 'CREATED', 200: 'CONFIRMED', 400: 'DISPATCHED', 500: 'COURIER_AT_CUSTOMER', 600: 'COMPLETED',
  901: 'CANCELLED', 902: 'CANCELLED', 903: 'CANCELLED', 921: 'CANCELLED', 922: 'CANCELLED', 923: 'CANCELLED',
  941: 'CANCELLED', 942: 'CANCELLED', 943: 'CANCELLED', 944: 'CANCELLED', 945: 'CANCELLED', 946: 'CANCELLED',
  961: 'CANCELLED', 971: 'CANCELLED', 981: 'CANCELLED',
};

/** Converts only documented native 99Food codes at the provider boundary. */
export function food99OrderStatus(value: unknown): Food99OrderStatus | null {
  const code = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value.trim()) : null;
  return code !== null && Number.isInteger(code) ? STATUS_BY_CODE[code] ?? null : null;
}
