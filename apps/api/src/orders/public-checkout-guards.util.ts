import { BadRequestException } from '@nestjs/common';
import type { PaymentMethod } from '@gestor/types';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FALLBACK_RETURN_URL = 'https://gestor-delivery-pro.vercel.app';

export function isValidEmail(email: unknown): email is string {
  if (typeof email !== 'string') return false;
  const value = email.trim();
  if (!value) return false;
  return EMAIL_REGEX.test(value);
}

export function assertOnlinePaymentEmail(method: PaymentMethod, customerEmail?: string | null): void {
  if (method === 'pix' || method === 'credit_card' || method === 'debit_card') {
    if (!isValidEmail(customerEmail)) {
      throw new BadRequestException('Informe um e-mail válido para continuar com este pagamento.');
    }
  }
}

export function normalizeReturnUrl(returnUrl?: string): string {
  if (!returnUrl || typeof returnUrl !== 'string') return FALLBACK_RETURN_URL;

  try {
    const parsed = new URL(returnUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return FALLBACK_RETURN_URL;
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return FALLBACK_RETURN_URL;
  }
}

export function validateCashChangeFor(changeFor: unknown, total: number): void {
  if (changeFor === null || changeFor === undefined) return;

  if (typeof changeFor !== 'number' || Number.isNaN(changeFor) || !Number.isFinite(changeFor) || changeFor < 0) {
    throw new BadRequestException('Informe um valor de troco válido.');
  }

  if (changeFor > 0 && changeFor < total) {
    throw new BadRequestException('O valor informado para troco não pode ser menor que o total do pedido.');
  }
}
