import 'reflect-metadata';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DriverShiftStatus } from '@gestor/types';
import { DriverEarningsPanel } from './DriverEarningsPanel';

describe('DriverEarningsPanel', () => {
  it('filters tenant cash-tip choices and labels totals as ledger, not settlement', () => {
    const html = renderToStaticMarkup(<DriverEarningsPanel summary={{ shiftId: 'shift', shiftStatus: DriverShiftStatus.ENDED, deliveryFees: 8, cashTips: 0, dailyRate: 30, dailyRatePreview: false, adjustments: 0, totalEarnings: 38, receivedDirectly: 0, dueFromStore: 38, currency: 'BRL', eligibleCashTipOrders: [{ orderId: 'order-d', orderNumber: '2', customerName: 'Atendido' }] }} isLoading={false} isError={false} isMutating={false} onCashTip={vi.fn()} onAdjustment={vi.fn()} />);
    expect(html).toContain('Último turno encerrado');
    expect(html).toContain('não confirma quitação financeira');
    expect(html).toContain('min-h-11');
  });
});
