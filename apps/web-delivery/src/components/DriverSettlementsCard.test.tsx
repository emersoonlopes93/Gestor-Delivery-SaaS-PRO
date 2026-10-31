import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DriverSettlementMethod, DriverShiftPaymentStatus, type DriverSettlementHistoryDTO } from '@gestor/types';
import { DriverSettlementsCard } from './DriverSettlementsCard';

const payment: DriverSettlementHistoryDTO = {
  id: 'settlement-a', driverId: 'driver-a', amount: 82, currency: 'BRL', paymentMethod: DriverSettlementMethod.PIX,
  paidAt: '2026-08-13T19:00:00.000Z', notes: 'Pago no fim do expediente', createdBy: 'manager-a', createdByName: 'Gestora Ana',
  createdAt: '2026-08-13T19:01:00.000Z', shifts: [{ shiftId: 'shift-a', startedAt: '2026-08-13T10:00:00.000Z', endedAt: '2026-08-13T18:00:00.000Z', grossEarnings: 92, receivedDirectly: 10, amountDue: 82, currency: 'BRL', status: DriverShiftPaymentStatus.PAID, settlementId: 'settlement-a' }],
};

const summary = { driverId: 'driver-a', currentDue: 76, pendingShiftCount: 1, currency: 'BRL', lastPayment: payment };

describe('DriverSettlementsCard', () => {
  it('shows due, last payment, history and immutable paid-shift details', async () => {
    const getDetail = vi.fn().mockResolvedValue(payment);
    render(<DriverSettlementsCard summary={summary} history={[payment]} isLoading={false} isRefreshing={false} error={null} onRetry={vi.fn()} onOpenDetail={getDetail} />);
    expect(screen.getByText(/76,00/)).toBeTruthy();
    expect(screen.getByText(/O app n.o faz PIX/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Ver hist.rico/ }));
    const opener = screen.getByRole('button', { name: /82,00/ });
    opener.focus();
    fireEvent.click(opener);
    await waitFor(() => expect(getDetail).toHaveBeenCalledWith('settlement-a'));
    const dialog = screen.getByRole('dialog', { name: /82,00/ });
    const close = screen.getByRole('button', { name: 'Fechar detalhes' });
    expect(document.activeElement).toBe(close);
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.children[0].getAttribute('aria-hidden')).toBe('true');
    fireEvent.keyDown(close, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    expect(screen.getByRole('heading', { name: 'Turnos pagos' })).toBeTruthy();
    expect(screen.getByText('Ganhos brutos')).toBeTruthy();
    expect(screen.getByText(/Somente leitura/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /pagar agora|transferir agora|excluir|editar/i })).toBeNull();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(opener);
  });

  it('keeps last good data visible during refresh errors and offers retry', () => {
    const retry = vi.fn().mockResolvedValue(undefined);
    render(<DriverSettlementsCard summary={summary} history={[payment]} isLoading={false} isRefreshing={false} error="Sem conexão" onRetry={retry} onOpenDetail={vi.fn()} />);
    expect(screen.getByText(/76,00/)).toBeTruthy();
    expect(screen.getByText(/dados carregados continuam vis/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('renders a genuine empty history separately from loading and errors', () => {
    render(<DriverSettlementsCard summary={{ ...summary, currentDue: 0, pendingShiftCount: 0, lastPayment: null }} history={[]} isLoading={false} isRefreshing={false} error={null} onRetry={vi.fn()} onOpenDetail={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Ver hist.rico/ }));
    expect(screen.getByText(/ainda n.o registrou pagamentos/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
