import { describe, expect, it } from 'vitest';
import { DeliveryRunStatus, DeliveryStopStatus, DriverStatus, DriverVehicleType, type DeliveryRunDTO, type DriverDTO } from '@gestor/types';
import { driverMapState, formatStopAddress, nextRunStop, orderBelongsToRun, remainingRunStops } from './tracking-map.utils';

const run: DeliveryRunDTO = {
  id: 'run-a', driverId: 'driver-a', driverName: 'Ana', status: DeliveryRunStatus.IN_PROGRESS,
  version: 1, assignedAt: null, acceptedAt: null, startedAt: null, returningAt: null,
  completedAt: null, createdAt: '2026-08-12T12:00:00.000Z',
  stops: [
    { id: 'a', orderId: 'a', sequence: 1, status: DeliveryStopStatus.DELIVERED, attempts: 0, orderNumber: '101', customerName: 'A', customerPhone: '', address: null, arrivedAt: null, deliveredAt: null, failedAt: null, failureReason: null, returnRequiredAt: null, returnedAt: null, cancelledAt: null, cancellationReason: null },
    { id: 'b', orderId: 'b', sequence: 2, status: DeliveryStopStatus.CURRENT, attempts: 0, orderNumber: '102', customerName: 'B', customerPhone: '', address: null, arrivedAt: null, deliveredAt: null, failedAt: null, failureReason: null, returnRequiredAt: null, returnedAt: null, cancelledAt: null, cancellationReason: null },
    { id: 'c', orderId: 'c', sequence: 3, status: DeliveryStopStatus.PENDING, attempts: 0, orderNumber: '103', customerName: 'C', customerPhone: '', address: null, arrivedAt: null, deliveredAt: null, failedAt: null, failureReason: null, returnRequiredAt: null, returnedAt: null, cancelledAt: null, cancellationReason: null },
  ],
};

const driver: DriverDTO = {
  id: 'driver-a', tenantId: 'tenant-a', name: 'Ana', phone: '', isActive: true,
  status: DriverStatus.busy, vehicleType: DriverVehicleType.motorcycle,
  createdAt: '2026-08-12T12:00:00.000Z', updatedAt: '2026-08-12T12:00:00.000Z',
};

describe('tenant tracking map helpers', () => {
  it('keeps a run operational after one stop is delivered', () => {
    expect(nextRunStop(run)?.orderId).toBe('b');
    expect(remainingRunStops(run)).toBe(2);
  });

  it('distinguishes fresh, stale, and unavailable locations with canonical labels', () => {
    const now = new Date('2026-08-12T12:02:00.000Z');
    expect(driverMapState({ ...driver, lastLocationAt: '2026-08-12T12:01:45.000Z' }, now).status).toBe('fresh');
    expect(driverMapState({ ...driver, lastLocationAt: '2026-08-12T11:58:00.000Z' }, now).status).toBe('stale');
    expect(driverMapState(driver, now)).toEqual({ status: 'unavailable', ageSeconds: null, label: 'Localização temporariamente indisponível' });
  });

  it('confirms tracking only when the delivery order belongs to the assigned driver run', () => {
    const order = { id: 'b', fulfillmentType: 'delivery' as const, deliveryDriverId: 'driver-a' };
    expect(orderBelongsToRun(order, run)).toBe(true);
    expect(orderBelongsToRun({ ...order, id: 'outside' }, run)).toBe(false);
    expect(orderBelongsToRun({ ...order, deliveryDriverId: 'driver-b' }, run)).toBe(false);
  });

  it('keeps all operational address details readable', () => {
    expect(formatStopAddress({ street: 'Rua A', number: '10', complement: 'Fundos', neighborhood: 'Centro', city: 'Santos', state: 'SP', zipCode: '11000-000', reference: 'Portão verde' })).toBe('Rua A, 10 · Fundos · Centro · Santos - SP · 11000-000 · Referência: Portão verde');
  });
});
