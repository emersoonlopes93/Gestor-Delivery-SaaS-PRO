import { BadRequestException } from '@nestjs/common';
import type { PaymentMethod } from '@gestor/types';
import {
  assertOnlinePaymentEmail,
  normalizeReturnUrl,
  validateCashChangeFor,
} from './public-checkout-guards.util';

describe('public-checkout guards', () => {
  describe('assertOnlinePaymentEmail', () => {
    it.each(['pix', 'credit_card', 'debit_card'] as const)('rejects %s without email', (method) => {
      expect(() => assertOnlinePaymentEmail(method as PaymentMethod, '')).toThrow(BadRequestException);
    });

    it('accepts offline payments without email', () => {
      expect(() => assertOnlinePaymentEmail('cash' as PaymentMethod, '')).not.toThrow();
    });
  });

  describe('validateCashChangeFor', () => {
    it('accepts zero as no change', () => {
      expect(() => validateCashChangeFor(0, 10)).not.toThrow();
    });

    it('rejects change smaller than total', () => {
      expect(() => validateCashChangeFor(9, 10)).toThrow('O valor informado para troco não pode ser menor que o total do pedido.');
    });

    it('rejects NaN and empty-like values', () => {
      expect(() => validateCashChangeFor('', 10)).toThrow('Informe um valor de troco válido.');
      expect(() => validateCashChangeFor('abc', 10)).toThrow('Informe um valor de troco válido.');
      expect(() => validateCashChangeFor(Number.NaN, 10)).toThrow('Informe um valor de troco válido.');
    });
  });

  describe('normalizeReturnUrl', () => {
    it('falls back for invalid url', () => {
      expect(normalizeReturnUrl('nota-url')).toBe('https://gestor-delivery-pro.vercel.app');
      expect(normalizeReturnUrl('ftp://example.com')).toBe('https://gestor-delivery-pro.vercel.app');
    });

    it('keeps absolute http url', () => {
      expect(normalizeReturnUrl('https://example.com/checkout/')).toBe('https://example.com/checkout');
    });
  });
});
