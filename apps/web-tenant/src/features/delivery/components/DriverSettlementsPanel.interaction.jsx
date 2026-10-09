// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DriverSettlementMethod,
  DriverShiftPaymentStatus,
} from '@gestor/types';
import { DriverSettlementsPanel } from './DriverSettlementsPanel';
import { selectedSettlementTotal, settlementAttemptKey, shouldBlockSettlementSubmit } from './driver-settlement-ui';
import { driverSettlementPeriodSuffix } from '../hooks/driver-settlement-query';

const mocks = vi.hoisted(() => ({
  hook: vi.fn(),
  createSettlement: vi.fn(),
  getDetail: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('../hooks/useDriverSettlements', () => ({
  settlementErrorMessage: (error) => {
    if (typeof error === 'object' && error !== null && 'status' in error && error.status === 409) {
      return 'Um destes turnos acabou de ser quitado por outro gestor. Atualize a lista antes de tentar novamente.';
    }
    return error instanceof Error ? error.message : 'Falha ao carregar';
  },
  useDriverSettlements: (...args) => mocks.hook(...args),
}));

const pending = [
  { shiftId: 'shift-a', startedAt: '2026-08-13T10:00:00.000Z', endedAt: '2026-08-13T18:00:00.000Z', grossEarnings: 92, receivedDirectly: 10, amountDue: 82, currency: 'BRL', status: DriverShiftPaymentStatus.PENDING, settlementId: null },
  { shiftId: 'shift-b', startedAt: '2026-08-12T10:00:00.000Z', endedAt: '2026-08-12T18:00:00.000Z', grossEarnings: 80, receivedDirectly: 4, amountDue: 76, currency: 'BRL', status: DriverShiftPaymentStatus.PENDING, settlementId: null },
];

const payment = {
  id: 'settlement-a', driverId: 'driver-a', amount: 82, currency: 'BRL', paymentMethod: DriverSettlementMethod.PIX,
  paidAt: '2026-08-13T19:00:00.000Z', notes: 'Pago no fechamento', createdBy: 'manager-a', createdByName: 'Gestora Ana',
  createdAt: '2026-08-13T19:01:00.000Z', shifts: [{ ...pending[0], status: DriverShiftPaymentStatus.PAID, settlementId: 'settlement-a' }],
};

function readyState(overrides = {}) {
  return {
    summary: { driverId: 'driver-a', currentDue: 158, pendingShiftCount: 2, currency: 'BRL', lastPayment: payment },
    pending,
    paid: payment.shifts,
    history: [payment],
    isSummaryLoading: false, isPendingLoading: false, isPaidLoading: false, isHistoryLoading: false,
    summaryError: null, pendingError: null, paidError: null, historyError: null,
    isCreating: false,
    createSettlement: mocks.createSettlement,
    getDetail: mocks.getDetail,
    refresh: mocks.refresh,
    ...overrides,
  };
}

function selectAndReview(count = 1) {
  fireEvent.click(screen.getByRole('checkbox', { name: /13\/08\/2026/ }));
  if (count === 2) fireEvent.click(screen.getByRole('checkbox', { name: /12\/08\/2026/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Revisar registro' }));
}

describe('DriverSettlementsPanel RTL interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hook.mockReturnValue(readyState());
    mocks.getDetail.mockResolvedValue(payment);
    mocks.refresh.mockResolvedValue(undefined);
    mocks.createSettlement.mockResolvedValue(payment);
    document.body.style.overflow = '';
  });

  afterEach(() => {
    document.body.removeAttribute('aria-hidden');
    document.body.removeAttribute('inert');
    document.body.style.overflow = '';
  });

  it('gates finance data and keeps request errors distinct from empty results', () => {
    const view = render(<DriverSettlementsPanel driverId="driver-a" canRead={false} canManage={false} />);
    expect(screen.getByText('Sem permissão para informações financeiras.')).toBeTruthy();
    expect(mocks.hook).toHaveBeenLastCalledWith('driver-a', false, { from: '', to: '' });

    view.rerender(<DriverSettlementsPanel driverId="driver-a" canRead canManage />);
    mocks.hook.mockReturnValue(readyState({ pending: [], pendingError: new Error('offline') }));
    view.rerender(<DriverSettlementsPanel driverId="driver-a" canRead canManage />);
    expect(screen.getByRole('alert').textContent).toContain('Esta falha não significa que a lista está vazia');
    expect(screen.queryByText(/Nenhum turno pendente/)).toBeNull();
  });

  it('implements complete keyboard tabs and date-filter request parameters', async () => {
    render(<DriverSettlementsPanel driverId="driver-a" canRead canManage />);
    const pendingTab = screen.getByRole('tab', { name: 'Pendentes' });
    const paidTab = screen.getByRole('tab', { name: 'Pagos' });
    expect(pendingTab.getAttribute('aria-controls')).toBe('driver-settlements-panel-pending');
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe('driver-settlements-tab-pending');

    pendingTab.focus();
    fireEvent.keyDown(pendingTab, { key: 'ArrowLeft' });
    expect(paidTab.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(paidTab);
    fireEvent.keyDown(paidTab, { key: 'ArrowRight' });
    expect(pendingTab.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(pendingTab);
    fireEvent.keyDown(pendingTab, { key: 'ArrowRight' });
    expect(paidTab.getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(paidTab);
    expect(screen.getByRole('tabpanel').getAttribute('id')).toBe('driver-settlements-panel-paid');
    expect(screen.getByText('Pago')).toBeTruthy();
    fireEvent.keyDown(paidTab, { key: 'Home' });
    expect(document.activeElement).toBe(pendingTab);
    fireEvent.keyDown(pendingTab, { key: 'End' });
    expect(document.activeElement).toBe(paidTab);

    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-08-01' } });
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-08-14' } });
    await waitFor(() => expect(mocks.hook).toHaveBeenLastCalledWith('driver-a', true, { from: '2026-08-01', to: '2026-08-14' }));
    const query = new URLSearchParams(driverSettlementPeriodSuffix({ from: '2026-08-01', to: '2026-08-14' }).slice(1));
    expect(query.get('from')).toBe(new Date('2026-08-01T00:00:00').toISOString());
    expect(query.get('to')).toBe(new Date('2026-08-14T23:59:59.999').toISOString());
  });

  it('selects whole shifts, reviews the total and suppresses a double click to one POST', async () => {
    let resolveCreate = () => undefined;
    mocks.createSettlement.mockReturnValue(new Promise((resolve) => { resolveCreate = resolve; }));
    render(<DriverSettlementsPanel driverId="driver-a" canRead canManage />);
    selectAndReview(2);
    expect(screen.getByText('2 turnos selecionados')).toBeTruthy();
    expect(screen.getByText(/backend recalculará/)).toBeTruthy();
    const confirm = screen.getByRole('button', { name: 'Confirmar registro' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(mocks.createSettlement).toHaveBeenCalledTimes(1);
    const payload = mocks.createSettlement.mock.calls[0][0];
    expect(payload.shiftIds.sort()).toEqual(['shift-a', 'shift-b']);
    expect(payload).not.toHaveProperty('amount');
    await act(async () => resolveCreate(payment));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Pagamento registrado'));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('reuses the key for an exact ambiguous retry and rotates it for every meaningful payload change', async () => {
    mocks.createSettlement.mockRejectedValue(new Error('Resposta incerta'));
    render(<DriverSettlementsPanel driverId="driver-a" canRead canManage />);
    selectAndReview();
    const confirm = screen.getByRole('button', { name: 'Confirmar registro' });
    fireEvent.click(confirm);
    await screen.findByText('Resposta incerta');
    const firstKey = mocks.createSettlement.mock.calls[0][0].idempotencyKey;

    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.createSettlement).toHaveBeenCalledTimes(2));
    const retryKey = mocks.createSettlement.mock.calls[1][0].idempotencyKey;
    expect(retryKey).toBe(firstKey);

    fireEvent.change(screen.getByLabelText('Meio informado'), { target: { value: DriverSettlementMethod.CASH } });
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.createSettlement).toHaveBeenCalledTimes(3));
    const methodKey = mocks.createSettlement.mock.calls[2][0].idempotencyKey;

    fireEvent.change(screen.getByLabelText('Data do pagamento'), { target: { value: '2026-08-14T12:30' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.createSettlement).toHaveBeenCalledTimes(4));
    const dateKey = mocks.createSettlement.mock.calls[3][0].idempotencyKey;

    fireEvent.change(screen.getByLabelText('Observações'), { target: { value: 'Comprovante externo 10' } });
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.createSettlement).toHaveBeenCalledTimes(5));
    const notesKey = mocks.createSettlement.mock.calls[4][0].idempotencyKey;

    fireEvent.click(screen.getByRole('checkbox', { name: /12\/08\/2026/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Revisar registro' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar registro' }));
    await waitFor(() => expect(mocks.createSettlement).toHaveBeenCalledTimes(6));
    const selectionKey = mocks.createSettlement.mock.calls[5][0].idempotencyKey;

    expect(new Set([firstKey, methodKey, dateKey, notesKey, selectionKey]).size).toBe(5);
  });

  it('shows the friendly 409 conflict without claiming success', async () => {
    mocks.createSettlement.mockRejectedValue({ status: 409 });
    render(<DriverSettlementsPanel driverId="driver-a" canRead canManage />);
    selectAndReview();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar registro' }));
    expect((await screen.findByRole('alert')).textContent).toContain('quitado por outro gestor');
    expect(screen.queryByText('Pagamento registrado')).toBeNull();
  });

  it('opens an isolated modal detail, traps focus, exposes audit metadata and restores focus', async () => {
    const outerEscape = vi.fn();
    render(<div onKeyDown={(event) => { if (event.key === 'Escape') outerEscape(); }}><DriverSettlementsPanel driverId="driver-a" canRead canManage /></div>);
    const historyButton = screen.getByRole('button', { name: /R\$.*82,00.*PIX/ });
    historyButton.focus();
    fireEvent.click(historyButton);
    const dialog = await screen.findByRole('dialog', { name: /82,00/ });
    await waitFor(() => expect(mocks.getDetail).toHaveBeenCalledWith('settlement-a'));
    expect(within(dialog).getByText('Gestora Ana')).toBeTruthy();
    expect(within(dialog).getByText('Pago no fechamento')).toBeTruthy();
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body.children[0].getAttribute('aria-hidden')).toBe('true');
    const close = within(dialog).getByRole('button', { name: 'Fechar detalhes' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(outerEscape).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(historyButton);
  });

  it('keeps pure total and attempt guards deterministic', () => {
    expect(selectedSettlementTotal(pending, new Set(['shift-a', 'shift-b']))).toBe(158);
    const first = settlementAttemptKey('driver-a', null, () => 'attempt-a');
    expect(settlementAttemptKey('driver-a', first, () => 'attempt-b')).toBe(first);
    expect(shouldBlockSettlementSubmit(false, false, 2)).toBe(false);
    expect(shouldBlockSettlementSubmit(true, false, 2)).toBe(true);
  });
});
