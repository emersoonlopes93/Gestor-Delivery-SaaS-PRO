import 'reflect-metadata';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DeliveryRunStatus, DeliveryStopStatus, type DeliveryRunDTO, type DeliveryRunLocationHistoryDTO, type OrderResponseDTO } from '@gestor/types';
import { useQuery } from '@tanstack/react-query';
import { OrderTrackingDialog } from './OrderTrackingDialog';

let history: DeliveryRunLocationHistoryDTO;

vi.mock('@tanstack/react-query', () => ({ useQuery: vi.fn() }));
vi.mock('../../delivery/components/OperationalRouteMap', () => ({
  OperationalRouteMap: ({ focusedOrderId }: { focusedOrderId?: string }) => <div data-testid="route-map" data-focused-order={focusedOrderId} />,
}));

const order = {
  id: 'order-target', orderNumber: '202', status: 'out_for_delivery', fulfillmentType: 'delivery',
  customerName: 'Cliente', customerPhone: '11', itemsSubtotal: 10, discountTotal: 0, deliveryFee: 2,
  serviceFee: 0, total: 12, sourceChannel: 'pos', items: [], timeline: [], paymentMethod: 'cash',
  deliveryDriverId: 'driver-a', deliveryDriverName: 'Ana', createdAt: '2026-08-12T12:00:00.000Z', updatedAt: '2026-08-12T12:00:00.000Z',
} as OrderResponseDTO;

function makeRun(status = DeliveryRunStatus.IN_PROGRESS): DeliveryRunDTO {
  return {
    id: 'run-correct', driverId: 'driver-a', driverName: 'Ana', status, version: 1,
    assignedAt: null, acceptedAt: null, startedAt: '2026-08-12T12:00:00.000Z', returningAt: null,
    completedAt: status === DeliveryRunStatus.COMPLETED ? '2026-08-12T13:00:00.000Z' : null,
    createdAt: '2026-08-12T12:00:00.000Z',
    stops: [
      { id: 'stop-old', orderId: 'order-old', sequence: 1, status: DeliveryStopStatus.DELIVERED, attempts: 0, orderNumber: '201', customerName: 'Anterior', customerPhone: '', address: null, arrivedAt: null, deliveredAt: '2026-08-12T12:20:00.000Z', failedAt: null, failureReason: null, returnRequiredAt: null, returnedAt: null, cancelledAt: null, cancellationReason: null },
      { id: 'stop-target', orderId: order.id, sequence: 2, status: DeliveryStopStatus.CURRENT, attempts: 0, orderNumber: order.orderNumber, customerName: order.customerName, customerPhone: '', address: { street: 'Avenida Muito Longa', number: '1234', complement: 'Bloco B', neighborhood: 'Centro', city: 'São Paulo', state: 'SP', zipCode: '01000-000', reference: 'Portaria azul' }, arrivedAt: null, deliveredAt: null, failedAt: null, failureReason: null, returnRequiredAt: null, returnedAt: null, cancelledAt: null, cancellationReason: null },
    ],
  };
}

function renderDialog(run: DeliveryRunDTO, detailedAvailable = true): string {
  history = { runId: run.id, driverId: run.driverId, shiftId: 'shift-a', startedAt: run.startedAt, completedAt: run.completedAt, detailedAvailable, retainedUntil: detailedAvailable ? '2026-09-11T13:00:00.000Z' : null, points: detailedAvailable ? [{ lat: -23.5, lng: -46.6, recordedAt: '2026-08-12T12:10:00.000Z', accuracy: null, heading: null, speed: null, source: 'foreground' }] : [] };
  vi.mocked(useQuery).mockImplementation((options: { queryKey: readonly unknown[]; initialData?: unknown }) => {
    const key = options.queryKey;
    if (key[0] === 'delivery-run' && key[1] === 'order') return { data: options.initialData, isLoading: false, isError: false } as never;
    if (key[0] === 'delivery-run' && key[2] === 'locations') return { data: history, isLoading: false, isError: false } as never;
    if (key[0] === 'delivery-driver') return { data: { id: 'driver-a', tenantId: 'tenant-a', name: 'Ana', phone: '', isActive: true, status: 'busy', vehicleType: 'motorcycle', currentLat: -23.5, currentLng: -46.6, lastLocationAt: new Date().toISOString(), createdAt: '', updatedAt: '' }, isLoading: false, isError: false } as never;
    return { data: { id: 'tenant-a', settings: { lat: -23.51, lng: -46.61 } }, isLoading: false, isError: false } as never;
  });
  return renderToStaticMarkup(<OrderTrackingDialog order={order} initialRun={run} onClose={vi.fn()} />);
}

describe('OrderTrackingDialog', () => {
  it('targets the requested order and keeps the active run after a delivered stop', () => {
    const html = renderDialog(makeRun());
    expect(html).toContain('data-focused-order="order-target"');
    expect(html).toContain('Pedido 201');
    expect(html).toContain('Entregue');
    expect(html).toContain('Pedido 202');
    expect(html).toContain('Próxima parada');
    expect(html).toContain('Avenida Muito Longa, 1234 · Bloco B · Centro · São Paulo - SP · 01000-000 · Referência: Portaria azul');
  });

  it('offers retained completed history and explains expired detail while preserving stops', () => {
    expect(renderDialog(makeRun(DeliveryRunStatus.COMPLETED))).toContain('Ver trajeto no mapa');
    const expired = renderDialog(makeRun(DeliveryRunStatus.COMPLETED), false);
    expect(expired).toContain('Trajeto detalhado indisponível');
    expect(expired).toContain('Pedido 202');
  });
});
