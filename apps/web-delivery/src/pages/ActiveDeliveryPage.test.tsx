import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DeliveryRunStatus,
  DeliveryStopStatus,
  DriverShiftStatus,
  type DeliveryRunDTO,
  type DriverWorkStateDTO,
} from '@gestor/types';
import { ActiveDeliveryPage } from './ActiveDeliveryPage';
import { api } from '../lib/api';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  clearSession: vi.fn(),
  refresh: vi.fn(),
  startShift: vi.fn(),
  endShift: vi.fn(),
  acceptRun: vi.fn(),
  rejectRun: vi.fn(),
  startRun: vi.fn(),
  markArrived: vi.fn(),
  completeStop: vi.fn(),
  markFailed: vi.fn(),
  confirmReturn: vi.fn(),
  completeRun: vi.fn(),
  startTracking: vi.fn(),
  stopTracking: vi.fn(),
  cleanupPushForLogout: vi.fn(),
  refreshEarnings: vi.fn(),
  addCashTip: vi.fn(),
  routeState: {} as DriverWorkStateDTO & {
    isLoading: boolean;
    isMutating: boolean;
    error: string | null;
  },
  trackingState: {
    isTracking: false,
    error: null as string | null,
    lastLocation: null,
    lastDeliveryEvent: null,
    lastRouteEvent: null,
  },
}));

vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('../store/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    user: { name: 'Ana', driverId: 'driver-a' },
    logout: mocks.clearSession,
  }),
}));
vi.mock('../hooks/useDriverRoute', () => ({
  useDriverRoute: () => ({
    ...mocks.routeState,
    refresh: mocks.refresh,
    startShift: mocks.startShift,
    endShift: mocks.endShift,
    acceptRun: mocks.acceptRun,
    rejectRun: mocks.rejectRun,
    startRun: mocks.startRun,
    markArrived: mocks.markArrived,
    completeStop: mocks.completeStop,
    markFailed: mocks.markFailed,
    confirmReturn: mocks.confirmReturn,
    completeRun: mocks.completeRun,
  }),
}));
vi.mock('../hooks/useDriverEarnings', () => ({
  useDriverEarnings: () => ({
    summary: null,
    isLoading: false,
    isMutating: false,
    error: null,
    refresh: mocks.refreshEarnings,
    addCashTip: mocks.addCashTip,
  }),
}));
vi.mock('../hooks/useDriverTracking', () => ({
  useDriverTracking: () => ({
    ...mocks.trackingState,
    startTracking: mocks.startTracking,
    stopTracking: mocks.stopTracking,
  }),
}));
vi.mock('../hooks/usePushNotifications', () => ({
  usePushNotifications: () => ({
    permissionState: 'unsupported',
    isSubscribed: false,
    isLoading: false,
    requestPermissionAndSubscribe: vi.fn(),
    unsubscribe: vi.fn(),
    cleanupForLogout: mocks.cleanupPushForLogout,
  }),
}));
vi.mock('../components/NativeNotificationBanner', () => ({ NativeNotificationBanner: () => null }));
vi.mock('../components/DriverRouteMap', () => ({
  DriverRouteMap: () => <div data-testid="driver-route-map" />,
}));
vi.mock('../lib/api', () => ({ api: { post: vi.fn() } }));

function run(status: DeliveryRunStatus, stopStatus = DeliveryStopStatus.PENDING): DeliveryRunDTO {
  return {
    id: 'run-a',
    driverId: 'driver-a',
    driverName: 'Ana',
    status,
    version: 2,
    assignedAt: '2026-08-11T12:00:00.000Z',
    acceptedAt: status === DeliveryRunStatus.PENDING_ACCEPTANCE ? null : '2026-08-11T12:01:00.000Z',
    startedAt: status === DeliveryRunStatus.IN_PROGRESS || status === DeliveryRunStatus.RETURNING
      ? '2026-08-11T12:02:00.000Z'
      : null,
    returningAt: status === DeliveryRunStatus.RETURNING ? '2026-08-11T12:10:00.000Z' : null,
    completedAt: null,
    createdAt: '2026-08-11T12:00:00.000Z',
    stops: [
      {
        id: 'stop-a', orderId: 'order-a', sequence: 1, status: stopStatus, attempts: 1,
        orderNumber: '101', customerName: 'Cliente A', customerPhone: '5511999999999',
        address: { street: 'Rua A', number: '10', neighborhood: 'Centro' },
        arrivedAt: stopStatus === DeliveryStopStatus.ARRIVED ? '2026-08-11T12:05:00.000Z' : null,
        deliveredAt: null, failedAt: null, failureReason: stopStatus === DeliveryStopStatus.RETURN_TO_STORE ? 'Cliente não respondeu' : null,
        returnRequiredAt: null, returnedAt: null, cancelledAt: null, cancellationReason: null,
      },
      {
        id: 'stop-b', orderId: 'order-b', sequence: 2, status: DeliveryStopStatus.PENDING, attempts: 0,
        orderNumber: '102', customerName: 'Cliente B', customerPhone: '5511888888888', address: null,
        arrivedAt: null, deliveredAt: null, failedAt: null, failureReason: null,
        returnRequiredAt: null, returnedAt: null, cancelledAt: null, cancellationReason: null,
      },
    ],
  };
}

function setState(activeRun: DeliveryRunDTO | null, hasShift = true) {
  mocks.routeState = {
    shift: hasShift ? {
      id: 'shift-a', status: DriverShiftStatus.ACTIVE,
      startedAt: '2026-08-11T11:00:00.000Z', endedAt: null,
    } : null,
    activeRun,
    trackingRequired: Boolean(activeRun && [
      DeliveryRunStatus.IN_PROGRESS,
      DeliveryRunStatus.RETURNING,
    ].includes(activeRun.status)),
    isLoading: false,
    isMutating: false,
    error: null,
  };
}

describe('ActiveDeliveryPage canonical route lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setState(null, false);
    mocks.trackingState.lastDeliveryEvent = null;
    mocks.trackingState.lastRouteEvent = null;
    mocks.trackingState.isTracking = false;
    mocks.startShift.mockResolvedValue(true);
    mocks.startTracking.mockResolvedValue(true);
    mocks.startRun.mockResolvedValue(true);
    mocks.acceptRun.mockResolvedValue(true);
    mocks.markFailed.mockResolvedValue(true);
    mocks.confirmReturn.mockResolvedValue(true);
    mocks.cleanupPushForLogout.mockResolvedValue(undefined);
  });

  it('starts an explicit shift instead of treating GPS or login as online', async () => {
    render(<ActiveDeliveryPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Ficar online' }));
    await waitFor(() => expect(mocks.startShift).toHaveBeenCalledOnce());
    expect(screen.getByText(/use o aplicativo PedeHub Entregador para Android/)).toBeTruthy();
  });

  it('requires one route-level acceptance and exposes friendly rejection reasons', async () => {
    setState(run(DeliveryRunStatus.PENDING_ACCEPTANCE));
    render(<ActiveDeliveryPage />);
    expect(screen.getAllByText('2 entregas')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar rota' }));
    await waitFor(() => expect(mocks.acceptRun).toHaveBeenCalledWith('run-a'));
    fireEvent.click(screen.getByRole('button', { name: 'Não posso fazer esta rota' }));
    expect(screen.getByRole('radio', { name: /Problema com veículo/ })).toBeTruthy();
  });

  it('requires location before starting an auto-assigned route', async () => {
    setState(run(DeliveryRunStatus.ASSIGNED));
    render(<ActiveDeliveryPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar rota' }));
    await waitFor(() => expect(mocks.startTracking).toHaveBeenCalledOnce());
    expect(mocks.startTracking.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.startRun.mock.invocationCallOrder[0]);
    expect(screen.queryByRole('button', { name: 'Aceitar rota' })).toBeNull();
  });

  it('supports arrival, completion or failed attempt while keeping the next stop visible', () => {
    setState(run(DeliveryRunStatus.IN_PROGRESS, DeliveryStopStatus.ARRIVED));
    render(<ActiveDeliveryPage />);
    expect(screen.getByRole('button', { name: /Confirmar entrega/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Não foi possível entregar' }));
    expect(screen.getByRole('radio', { name: /Cliente não estava no local/ })).toBeTruthy();
    expect(screen.getByText('Pedido #102')).toBeTruthy();
    expect(screen.getByText('Depois')).toBeTruthy();
    expect(screen.getByTestId('driver-route-map')).toBeTruthy();
  });

  it('starts tracking for an in-progress route and stops it after the route ends', async () => {
    setState(run(DeliveryRunStatus.IN_PROGRESS, DeliveryStopStatus.CURRENT));
    const view = render(<ActiveDeliveryPage />);
    await waitFor(() => expect(mocks.startTracking).toHaveBeenCalledOnce());

    mocks.trackingState.isTracking = true;
    setState(null, true);
    view.rerender(<ActiveDeliveryPage />);
    await waitFor(() => expect(mocks.stopTracking).toHaveBeenCalledOnce());
  });

  it('confirms physical returns before the route can finish', async () => {
    setState(run(DeliveryRunStatus.RETURNING, DeliveryStopStatus.RETURN_TO_STORE));
    render(<ActiveDeliveryPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' }));
    await waitFor(() => expect(mocks.confirmReturn).toHaveBeenCalledWith('run-a', 'stop-a'));
    expect(screen.getByText('Cliente não respondeu')).toBeTruthy();
  });

  it('keeps the authenticated session when logout is blocked by active work', async () => {
    setState(run(DeliveryRunStatus.IN_PROGRESS, DeliveryStopStatus.CURRENT));
    vi.mocked(api.post).mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: 'Finalize sua rota ou encerre seu turno antes de sair.' } },
    });
    render(<ActiveDeliveryPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    await waitFor(() => expect(screen.getByText('Você ainda está trabalhando')).toBeTruthy());
    expect(mocks.clearSession).not.toHaveBeenCalled();
    expect(mocks.stopTracking).not.toHaveBeenCalled();
  });

  it('announces a reordered route and reconciles the canonical work state', async () => {
    setState(run(DeliveryRunStatus.IN_PROGRESS, DeliveryStopStatus.CURRENT));
    mocks.trackingState.lastRouteEvent = {
      eventId: 'event-a',
      type: 'delivery.run_updated',
      change: 'reordered',
      runId: 'run-a',
      driverId: 'driver-a',
      version: 3,
      occurredAt: '2026-08-11T12:10:00.000Z',
    };
    render(<ActiveDeliveryPage />);
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('ordem das próximas entregas mudou'));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('announces a cancelled stop and keeps the canonical route as source of truth', async () => {
    setState(run(DeliveryRunStatus.IN_PROGRESS, DeliveryStopStatus.CURRENT));
    mocks.trackingState.lastRouteEvent = {
      eventId: 'event-cancelled',
      type: 'delivery.stop_updated',
      change: 'cancelled',
      runId: 'run-a',
      stopId: 'stop-a',
      occurredAt: '2026-08-11T12:11:00.000Z',
    };
    render(<ActiveDeliveryPage />);
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('não precisa mais ser realizada'));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
