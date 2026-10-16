import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DriverShiftStatus } from '@gestor/types';
import { DriverEarningsCard } from './DriverEarningsCard';

const summary = { shiftId: 'shift-a', shiftStatus: DriverShiftStatus.ACTIVE, deliveryFees: 16, cashTips: 10, dailyRate: 50, dailyRatePreview: true, adjustments: -2, totalEarnings: 74, receivedDirectly: 10, dueFromStore: 64, currency: 'BRL', eligibleCashTipOrders: [{ orderId: 'order-101', orderNumber: '101', customerName: 'Cliente' }] };

describe('DriverEarningsCard', () => {
  it('renders ledger totals and historical tip choices without claiming payment', () => {
    render(<DriverEarningsCard summary={summary} eligibleStops={summary.eligibleCashTipOrders} isLoading={false} isMutating={false} error={null} onAddCashTip={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes' }));
    expect(screen.getByText('Devido pela loja')).toBeTruthy();
    expect(screen.getByText('Diária (prevista)')).toBeTruthy();
    expect(screen.getByText(/não é comprovante de pagamento/i)).toBeTruthy();
    expect(screen.getAllByRole('button').every((button) => button.className.includes('min-h-11') || button.getAttribute('aria-controls') === 'earnings-details')).toBe(true);
  });
});
