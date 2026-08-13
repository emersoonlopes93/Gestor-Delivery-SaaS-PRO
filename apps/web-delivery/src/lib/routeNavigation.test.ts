import { describe, expect, it } from 'vitest';
import { DeliveryStopStatus, type DeliveryStopDTO } from '@gestor/types';
import { coordinatesFromAddress, geocodedStops, navigationUrl } from './routeNavigation';

function stop(address: Record<string, unknown> | null): DeliveryStopDTO {
  return {
    id: 'stop-a',
    orderId: 'order-a',
    sequence: 2,
    status: DeliveryStopStatus.CURRENT,
    attempts: 0,
    orderNumber: '321',
    customerName: 'Cliente',
    customerPhone: '',
    address,
    arrivedAt: null,
    deliveredAt: null,
    failedAt: null,
    failureReason: null,
    returnRequiredAt: null,
    returnedAt: null,
    cancelledAt: null,
    cancellationReason: null,
  };
}

describe('route navigation helpers', () => {
  it('accepts finite persisted address coordinates and ignores invalid values', () => {
    expect(coordinatesFromAddress({ lat: '-23.5505', lng: -46.6333 })).toEqual({
      lat: -23.5505,
      lng: -46.6333,
    });
    expect(coordinatesFromAddress({ lat: 120, lng: -46.6 })).toBeNull();
    expect(coordinatesFromAddress({ street: 'Rua sem geocodificação' })).toBeNull();
  });

  it('keeps only geocoded stops without changing their persisted sequence', () => {
    const result = geocodedStops([
      stop(null),
      { ...stop({ lat: -23.5, lng: -46.6 }), id: 'stop-b', sequence: 7 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.stop.sequence).toBe(7);
  });

  it('builds encoded web fallbacks and native deep links for every provider', () => {
    const point = { lat: -23.5505, lng: -46.6333 };
    expect(navigationUrl('google', point, 'Pedido 321', false)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=-23.5505%2C-46.6333',
    );
    expect(navigationUrl('waze', point, 'Pedido 321', false)).toContain('https://www.waze.com/ul?ll=-23.5505%2C-46.6333');
    expect(navigationUrl('google', point, 'Pedido 321', true)).toBe('google.navigation:q=-23.5505%2C-46.6333');
    expect(navigationUrl('waze', point, 'Pedido 321', true)).toBe('waze://?ll=-23.5505%2C-46.6333&navigate=yes');
    expect(navigationUrl('system', point, 'Pedido 321', true)).toContain('geo:-23.5505,-46.6333?q=');
  });
});
