import type { LatLngExpression } from 'leaflet';
import type { DeliveryRateRule, DeliveryZoneKind, DeliveryPricingMode, PolygonCoordinates, SpecialAreaDraft, TierDraft } from './types';

export function parseDecimalString(value: string | null): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizePolygonCoordinates(value: unknown): PolygonCoordinates | null {
  if (!Array.isArray(value)) return null;
  const out: Array<readonly [number, number]> = [];
  for (const item of value) {
    if (!Array.isArray(item) || item.length < 2) return null;
    const lng = item[0];
    const lat = item[1];
    if (typeof lng !== 'number' || typeof lat !== 'number') return null;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    out.push([lng, lat] as const);
  }
  return out;
}

export function coordsToLatLngs(coords: PolygonCoordinates): LatLngExpression[] {
  return coords.map(([lng, lat]) => [lat, lng] as LatLngExpression);
}

export function ensureRingClosed(points: PolygonCoordinates): PolygonCoordinates {
  if (points.length === 0) return points;
  const [firstLng, firstLat] = points[0];
  const [lastLng, lastLat] = points[points.length - 1];
  if (firstLng === lastLng && firstLat === lastLat) return points;
  return [...points, [firstLng, firstLat] as const];
}

export function defaultZoneColor(): string {
  return '#2563eb';
}

export function zoneColorPreset(zoneKind: DeliveryZoneKind, pricingMode: DeliveryPricingMode): string {
  if (zoneKind === 'blocked_zone') return '#ef4444';
  if (pricingMode === 'free') return '#16a34a';
  if (pricingMode === 'distance') return '#f59e0b';
  return '#2563eb';
}

export function fmtMoney(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 'R$ 0,00';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function tierLabel(tier: TierDraft): string {
  if (tier.minDistanceKm <= 0) return `Até ${tier.maxDistanceKm} km`;
  return `${tier.minDistanceKm} a ${tier.maxDistanceKm} km`;
}

export function getAreaSummary(rule: DeliveryRateRule): string {
  if (rule.zoneKind === 'blocked_zone') return 'Área bloqueada';
  if (rule.pricingMode === 'free') return 'Entrega grátis';
  if (rule.pricingMode === 'distance') return 'Cobrança por km';
  return 'Taxa fixa';
}

export function hydrateSpecialArea(rule: DeliveryRateRule): SpecialAreaDraft {
  return {
    id: rule.id,
    name: rule.name ?? '',
    color: rule.color ?? zoneColorPreset(rule.zoneKind ?? 'custom_zone', rule.pricingMode ?? 'fixed'),
    zoneKind: rule.zoneKind ?? 'custom_zone',
    pricingMode: rule.zoneKind === 'blocked_zone' ? 'fixed' : rule.pricingMode ?? 'fixed',
    fixedFee: parseDecimalString(rule.fixedFee) ?? parseDecimalString(rule.fixedRate),
    pricePerKm: parseDecimalString(rule.pricePerKm) ?? parseDecimalString(rule.ratePerKm),
    estimatedDeliveryMinutes: rule.estimatedDeliveryMinutes ?? 45,
    polygonCoordinates: normalizePolygonCoordinates(rule.polygonCoordinates),
  };
}

export function validateTierDrafts(tiers: TierDraft[]): string | null {
  const sorted = [...tiers].sort((a, b) => a.minDistanceKm - b.minDistanceKm);
  for (let i = 0; i < sorted.length; i++) {
    const tier = sorted[i];
    if (tier.minDistanceKm < 0) return 'A distância inicial não pode ser negativa.';
    if (tier.maxDistanceKm <= tier.minDistanceKm) return 'A distância final deve ser maior que a inicial.';
    if (tier.fee < 0) return 'A taxa não pode ser negativa.';
    if (!Number.isInteger(tier.estimatedDeliveryMinutes) || tier.estimatedDeliveryMinutes <= 0) {
      return 'O tempo estimado deve ser um inteiro maior que zero.';
    }
    if (i > 0 && tier.minDistanceKm < sorted[i - 1].maxDistanceKm) {
      return 'As faixas de entrega não podem se sobrepor.';
    }
  }
  return null;
}
