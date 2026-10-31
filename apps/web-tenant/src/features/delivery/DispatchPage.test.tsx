import 'reflect-metadata';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DeliveryRunStatus,
  DeliveryStopStatus,
  DriverPayMode,
  DriverStatus,
  DriverVehicleType,
  type DeliveryRunDTO,
} from '@gestor/types';
import { DispatchPage } from './DispatchPage';
import { useDeliveryRuns } from './hooks/useDeliveryRuns';
import { useSmartDispatch } from './hooks/useSmartDispatch';

vi.mock('./hooks/useDeliveryRuns', () => ({ useDeliveryRuns: vi.fn() }));
vi.mock('./hooks/useSmartDispatch', () => ({ useSmartDispatch: vi.fn() }));

const mockedUseDeliveryRuns = vi.mocked(useDeliveryRuns);
const mockedUseSmartDispatch = vi.mocked(useSmartDispatch);

function activeRun(): DeliveryRunDTO {
  return {
    id: 'run-a',
    driverId: 'driver-a',
    driverName: 'Ana Entregas',
    status: DeliveryRunStatus.IN_PROGRESS,
    version: 4,
    assignedAt: '2026-08-11T12:00:00.000Z',
    acceptedAt: '2026-08-11T12:01:00.000Z',
    startedAt: '2026-08-11T12:02:00.000Z',
    returningAt: null,
    completedAt: null,
    createdAt: '2026-08-11T12:00:00.000Z',
    stops: [
      {
        id: 'stop-a', orderId: 'order-a', sequence: 1, status: DeliveryStopStatus.CURRENT, attempts: 0,
        orderNumber: '101', customerName: 'Cliente A', customerPhone: '11', address: null,
        arrivedAt: null, deliveredAt: null, failedAt: null, failureReason: null,
        returnRequiredAt: null, returnedAt: null, cancelledAt: null, cancellationReason: null,
      },
      {
        id: 'stop-b', orderId: 'order-b', sequence: 2, status: DeliveryStopStatus.PENDING, attempts: 0,
        orderNumber: '102', customerName: 'Cliente B', customerPhone: '22', address: null,
        arrivedAt: null, deliveredAt: null, failedAt: null, failureReason: null,
        returnRequiredAt: null, returnedAt: null, cancelledAt: null, cancellationReason: null,
      },
      {
        id: 'stop-c', orderId: 'order-c', sequence: 3, status: DeliveryStopStatus.CANCELLED, attempts: 0,
        orderNumber: '103', customerName: 'Cliente C', customerPhone: '33', address: null,
        arrivedAt: null, deliveredAt: null, failedAt: null, failureReason: null,
        returnRequiredAt: null, returnedAt: null, cancelledAt: '2026-08-11T12:03:00.000Z', cancellationReason: 'Pedido cancelado',
      },
    ],
  };
}

describe('DispatchPage multi-order route builder', () => {
  beforeEach(() => {
    mockedUseSmartDispatch.mockReturnValue({
      suggestion: {
        driver: { driverId: 'driver-b', name: 'Bia Livre', queuePosition: 2, distanceKm: 1.4, status: 'eligible', reason: null },
        queue: [
          { driverId: 'driver-a', name: 'Ana Entregas', queuePosition: 1, distanceKm: null, status: 'bypassed_stale_location', reason: null },
          { driverId: 'driver-b', name: 'Bia Livre', queuePosition: 2, distanceKm: 1.4, status: 'eligible', reason: null },
        ],
        orderIds: ['order-new'], reasons: [], manualFallback: false,
      },
      isLoading: false,
      isRefreshing: false,
      isError: false,
      isStale: false,
      refresh: vi.fn(),
      accept: vi.fn(),
      isAccepting: false,
      overrideKds: vi.fn(),
      isOverridingKds: false,
    });
    mockedUseDeliveryRuns.mockReturnValue({
      builder: {
        drivers: [{
          id: 'driver-free', tenantId: 'tenant-a', name: 'Bia Livre', phone: '11',
          isActive: true, status: DriverStatus.available, vehicleType: DriverVehicleType.motorcycle, notes: null,
          createdAt: '2026-08-11T12:00:00.000Z', updatedAt: '2026-08-11T12:00:00.000Z',
        }],
        orders: [{
          id: 'order-new', orderNumber: '104', customerName: 'Cliente Novo', customerPhone: '44',
          address: 'Rua A, 1 - Centro', createdAt: '2026-08-11T12:00:00.000Z',
        }],
      },
      activeRuns: [activeRun()],
      settings: { requiresAcceptance: true },
      paySettings: {
        mode: DriverPayMode.FIXED,
        dailyRate: 50,
        fixedAmount: 8,
        percentage: 0,
        rateTable: [{ upToKm: null, amount: 8 }],
        payFailedAttempt: false,
        currency: 'BRL',
      },
      isPaySettingsLoading: false,
      isPaySettingsError: false,
      isLoading: false,
      isError: false,
      createRun: vi.fn(),
      isCreating: false,
      reorderStops: vi.fn(),
      updateSettings: vi.fn(),
      updatePaySettings: vi.fn(),
      isUpdatingPaySettings: false,
    });
  });

  it('renders only eligible builder data and the tenant acceptance control', () => {
    const html = renderToStaticMarkup(<DispatchPage />);
    expect(html).toContain('Bia Livre');
    expect(html).toContain('Pedido 104');
    expect(html).toContain('Exigir aceite');
    expect(html).toContain('Pagamento dos entregadores');
    expect(html).toContain('A taxa cobrada do cliente é independente');
    expect(html).toContain('Editar regra');
    expect(html).not.toContain('Salvar regra de pagamento');
    expect(html).toContain('Somente entregadores online e livres');
    expect(html).toContain('Despacho assistido');
    expect(html).toContain('A fila foi preservada.');
    expect(html).toContain('Pedido');
    expect(html).not.toContain('bypassed_stale_location');
  });

  it('renders the manual fallback without blocking the existing builder', () => {
    mockedUseSmartDispatch.mockReturnValue({
      ...mockedUseSmartDispatch(),
      suggestion: { driver: null, queue: [], orderIds: [], reasons: [], manualFallback: true },
    });
    const html = renderToStaticMarkup(<DispatchPage />);
    expect(html).toContain('Sem sugestão segura agora');
    expect(html).toContain('Usar montagem manual');
    expect(html).toContain('Montar nova rota');
  });

  it('shows the run-scoped KDS override only for an assigned blocked route', () => {
    const blockedRun = activeRun();
    blockedRun.status = DeliveryRunStatus.ASSIGNED;
    blockedRun.kds = {
      blocked: true,
      blockingOrdersCount: 1,
      blockingOrderNumbers: ['101'],
      overrideApplied: false,
      overrideAt: null,
    };
    mockedUseDeliveryRuns.mockReturnValue({ ...mockedUseDeliveryRuns(), activeRuns: [blockedRun] });
    const html = renderToStaticMarkup(<DispatchPage />);
    expect(html).toContain('Aguardando cozinha.');
    expect(html).toContain('Liberar excepcionalmente');
    expect(html).not.toContain('kdsOverrideReason');
  });

  it('keeps cancellation history and offers accessible reorder only for future stops', () => {
    const html = renderToStaticMarkup(<DispatchPage />);
    expect(html).toContain('Pedido cancelado');
    expect(html).toContain('Pedidos não podem ser adicionados depois que a rota inicia.');
    expect(html).toContain('aria-label="Antecipar pedido 102"');
    expect(html).not.toContain('aria-label="Antecipar pedido 101"');
  });
});
