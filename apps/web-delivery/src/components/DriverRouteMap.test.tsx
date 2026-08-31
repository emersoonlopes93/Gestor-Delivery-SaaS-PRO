import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeliveryRunStatus, DeliveryStopStatus, type DeliveryStopDTO } from '@gestor/types';
import { DriverRouteMap } from './DriverRouteMap';

vi.mock('leaflet', () => ({ default: { divIcon: (options: unknown) => options } }));
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children?: ReactNode }) => <div data-testid="leaflet-map">{children}</div>,
  TileLayer: () => null,
  Marker: ({ title }: { title?: string }) => <span>{title}</span>,
  Polyline: () => <span data-testid="route-line" />,
  useMap: () => ({ setView: vi.fn(), fitBounds: vi.fn() }),
}));

function routeStop(status: DeliveryStopStatus, sequence = 1): DeliveryStopDTO {
  return { id: `stop-${sequence}`, orderId: `order-${sequence}`, sequence, status, attempts: 0, orderNumber: `${300 + sequence}`, customerName: `Cliente ${sequence}`, customerPhone: '', address: { street: 'Rua das Flores', number: `${sequence}`, lat: -23.55 + sequence / 1000, lng: -46.63 }, arrivedAt: null, deliveredAt: null, failedAt: null, failureReason: null, returnRequiredAt: null, returnedAt: null, cancelledAt: null, cancellationReason: null };
}
const addressText = (address: Record<string, unknown> | null) => address ? `${String(address.street)}, ${String(address.number)}` : 'Endereço não informado';

describe('DriverRouteMap', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders an accessible schematic with origin and optional web navigation', () => {
    const current = routeStop(DeliveryStopStatus.CURRENT);
    render(<DriverRouteMap status={DeliveryRunStatus.IN_PROGRESS} stops={[current, routeStop(DeliveryStopStatus.PENDING, 2)]} currentStop={current} currentPosition={{ lat: -23.56, lng: -46.64 }} origin={{ lat: -23.57, lng: -46.65, label: 'Loja Centro' }} nativePlatform={false} addressText={addressText} />);

    expect(screen.getByRole('region', { name: /posição atual e paradas numeradas/ })).toBeTruthy();
    expect(screen.getByText(/Origem: Loja Centro/)).toBeTruthy();
    expect(screen.getByText('Pedido #301')).toBeTruthy();
    expect(screen.getByText(/Não representa trajeto por ruas, otimização ou previsão/)).toBeTruthy();
    fireEvent.click(screen.getByText('Abrir navegação'));
    expect(screen.getByRole('link', { name: /Google Maps/ }).getAttribute('href')).toContain('https://www.google.com/maps/dir/');
    expect(screen.getByRole('link', { name: /Waze/ })).toBeTruthy();
  });

  it('does not draw customer stops as a return path without a genuine store coordinate', () => {
    render(<DriverRouteMap status={DeliveryRunStatus.RETURNING} stops={[routeStop(DeliveryStopStatus.RETURN_TO_STORE)]} currentStop={undefined} currentPosition={null} origin={null} nativePlatform={false} addressText={addressText} />);

    expect(screen.getByText('Localização da loja indisponível')).toBeTruthy();
    expect(screen.getByText(/não será desenhada sem uma coordenada real da loja/)).toBeTruthy();
    expect(screen.queryByTestId('route-line')).toBeNull();
    expect(screen.queryByText('Abrir navegação')).toBeNull();
  });

  it('uses the genuine store coordinate as the only return destination', () => {
    render(<DriverRouteMap status={DeliveryRunStatus.RETURNING} stops={[routeStop(DeliveryStopStatus.RETURN_TO_STORE)]} currentStop={undefined} currentPosition={{ lat: -23.56, lng: -46.64 }} origin={{ lat: -23.57, lng: -46.65, label: 'Loja Centro' }} nativePlatform={false} addressText={addressText} />);

    expect(screen.getByRole('region', { name: /retorno para a loja/ })).toBeTruthy();
    expect(screen.getByText('Destino de retorno confirmado pela coordenada da loja.')).toBeTruthy();
    expect(screen.queryByText(/Parada 1: pedido 301/)).toBeNull();
    fireEvent.click(screen.getByText('Abrir navegação'));
    expect(screen.getByRole('link', { name: /Google Maps/ }).getAttribute('href')).toContain('-23.57%2C-46.65');
  });
});
