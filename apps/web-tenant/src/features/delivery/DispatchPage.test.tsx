import 'reflect-metadata';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DeliveryRunStatus,
  DeliveryStopStatus,
  DriverStatus,
  DriverVehicleType,
  type DeliveryRunDTO,
} from '@gestor/types';
import { DispatchPage } from './DispatchPage';
import { useDeliveryRuns } from './hooks/useDeliveryRuns';

vi.mock('./hooks/useDeliveryRuns', () => ({ useDeliveryRuns: vi.fn() }));

const mockedUseDeliveryRuns = vi.mocked(useDeliveryRuns);

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
      isLoading: false,
      isError: false,
      createRun: vi.fn(),
      isCreating: false,
      reorderStops: vi.fn(),
      updateSettings: vi.fn(),
    });
  });

  it('renders only eligible builder data and the tenant acceptance control', () => {
    const html = renderToStaticMarkup(<DispatchPage />);
    expect(html).toContain('Bia Livre');
    expect(html).toContain('Pedido 104');
    expect(html).toContain('Exigir aceite');
    expect(html).toContain('Somente entregadores online e livres');
  });

  it('keeps cancellation history and offers accessible reorder only for future stops', () => {
    const html = renderToStaticMarkup(<DispatchPage />);
    expect(html).toContain('Pedido cancelado');
    expect(html).toContain('Pedidos não podem ser adicionados depois que a rota inicia.');
    expect(html).toContain('aria-label="Antecipar pedido 102"');
    expect(html).not.toContain('aria-label="Antecipar pedido 101"');
  });
});
