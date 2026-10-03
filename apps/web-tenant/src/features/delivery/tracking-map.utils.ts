import {
  DeliveryRunStatus,
  DeliveryStopStatus,
  getLocationFreshness,
  type DeliveryRunDTO,
  type DeliveryStopDTO,
  type DriverDTO,
  type OrderResponseDTO,
} from '@gestor/types';

export type MapPoint = { lat: number; lng: number };

export function pointFromAddress(address: Record<string, unknown> | null): MapPoint | null {
  const lat = address?.lat;
  const lng = address?.lng;
  return typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null;
}

export function stopStatusLabel(status: DeliveryStopStatus): string {
  const labels: Record<DeliveryStopStatus, string> = {
    [DeliveryStopStatus.PENDING]: 'Aguardando',
    [DeliveryStopStatus.CURRENT]: 'Próxima parada',
    [DeliveryStopStatus.ARRIVED]: 'Entregador chegou',
    [DeliveryStopStatus.DELIVERED]: 'Entregue',
    [DeliveryStopStatus.FAILED_ATTEMPT]: 'Tentativa sem sucesso',
    [DeliveryStopStatus.RETURN_TO_STORE]: 'Retorno necessário',
    [DeliveryStopStatus.RETURNED_TO_STORE]: 'Retornado à loja',
    [DeliveryStopStatus.CANCELLED]: 'Cancelada',
  };
  return labels[status];
}

export function runStatusLabel(status: DeliveryRunStatus): string {
  const labels: Record<DeliveryRunStatus, string> = {
    [DeliveryRunStatus.PENDING_ACCEPTANCE]: 'Aguardando aceite',
    [DeliveryRunStatus.ASSIGNED]: 'Rota atribuída',
    [DeliveryRunStatus.IN_PROGRESS]: 'Em rota',
    [DeliveryRunStatus.RETURNING]: 'Retornando à loja',
    [DeliveryRunStatus.COMPLETED]: 'Rota concluída',
    [DeliveryRunStatus.CANCELLED]: 'Rota cancelada',
  };
  return labels[status];
}

export function nextRunStop(run: DeliveryRunDTO): DeliveryStopDTO | null {
  return run.stops.find((stop) => [
    DeliveryStopStatus.CURRENT,
    DeliveryStopStatus.ARRIVED,
  ].includes(stop.status)) ?? run.stops.find((stop) => [
    DeliveryStopStatus.PENDING,
    DeliveryStopStatus.FAILED_ATTEMPT,
    DeliveryStopStatus.RETURN_TO_STORE,
  ].includes(stop.status)) ?? null;
}

export function remainingRunStops(run: DeliveryRunDTO): number {
  return run.stops.filter((stop) => [
    DeliveryStopStatus.PENDING,
    DeliveryStopStatus.CURRENT,
    DeliveryStopStatus.ARRIVED,
    DeliveryStopStatus.FAILED_ATTEMPT,
    DeliveryStopStatus.RETURN_TO_STORE,
  ].includes(stop.status)).length;
}

export function driverMapState(driver: DriverDTO, now = new Date()) {
  return getLocationFreshness(driver.lastLocationAt ?? null, now);
}

type OperationalAddress = { street?: unknown; number?: unknown; neighborhood?: unknown; complement?: unknown; city?: unknown; state?: unknown; zipCode?: unknown; reference?: unknown };

export function formatStopAddress(address: OperationalAddress | null): string {
  if (!address) return 'Endereço não informado';
  const street = typeof address.street === 'string' ? address.street : '';
  const number = typeof address.number === 'string' ? address.number : '';
  const neighborhood = typeof address.neighborhood === 'string' ? address.neighborhood : '';
  const complement = typeof address.complement === 'string' ? address.complement : '';
  const city = typeof address.city === 'string' ? address.city : '';
  const state = typeof address.state === 'string' ? address.state : '';
  const zipCode = typeof address.zipCode === 'string' ? address.zipCode : '';
  const reference = typeof address.reference === 'string' ? address.reference : '';
  const first = [street, number].filter(Boolean).join(', ');
  const cityAndState = [city, state].filter(Boolean).join(' - ');
  const main = [first, complement, neighborhood, cityAndState, zipCode].filter(Boolean).join(' · ');
  return [main, reference ? `Referência: ${reference}` : ''].filter(Boolean).join(' · ') || 'Endereço não informado';
}

export function orderBelongsToRun(order: Pick<OrderResponseDTO, 'id' | 'fulfillmentType' | 'deliveryDriverId'>, run: DeliveryRunDTO | null | undefined): boolean {
  if (order.fulfillmentType !== 'delivery' || !order.deliveryDriverId || !run) return false;
  return run.driverId === order.deliveryDriverId && run.stops.some((stop) => stop.orderId === order.id);
}
