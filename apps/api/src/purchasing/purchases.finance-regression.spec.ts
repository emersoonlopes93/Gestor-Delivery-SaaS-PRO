import { FinancialStatus, PaymentStatus } from '@gestor/types';

describe('Purchasing finance contract', () => {
  it('keeps the canonical status semantics used by purchase settlement', () => {
    expect(FinancialStatus.PENDING).toBe('pending');
    expect(FinancialStatus.PAID).toBe('paid');
    expect(FinancialStatus.CANCELLED).toBe('cancelled');
    expect(PaymentStatus.PENDING).toBe('pending');
    expect(PaymentStatus.PAID).toBe('paid');
  });
});
