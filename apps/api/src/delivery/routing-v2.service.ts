import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DeliveryRunStatus, DeliveryStopStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { calculateDistance, estimateDeliveryTime } from './utils/routing.utils';
import { OsrmRoutingProvider } from './osrm-routing.provider';
import type { RoutingCoordinate, RoutingProviderResult } from './routing-provider';
import { evaluateOwnFleetEligibility } from './own-fleet-eligibility';

type RouteStop = { id: string; sequence: number; addressSnapshot: Prisma.JsonValue };
const PRE_START: DeliveryRunStatus[] = [DeliveryRunStatus.PENDING_ACCEPTANCE, DeliveryRunStatus.ASSIGNED];

@Injectable()
export class RoutingV2Service {
  private readonly logger = new Logger(RoutingV2Service.name);
  private readonly cache = new Map<string, { expiresAt: number; result: RoutingProviderResult }>();
  constructor(private readonly prisma: PrismaService, private readonly osrm: OsrmRoutingProvider) {}

  async calculate(tenantId: string, runId: string, reason: string, optimize = true) {
    const startedAt = Date.now();
    const run = await this.prisma.deliveryRun.findFirst({
      where: { id: runId, tenantId },
      include: {
        driver: { select: { id: true } },
        stops: {
          where: { status: { in: [DeliveryStopStatus.PENDING, DeliveryStopStatus.CURRENT] } },
          include: { order: { select: { marketplaceOrders: { select: { provider: true, deliveryOwnership: true } } } } },
          orderBy: { sequence: 'asc' },
        },
      },
    });
    if (!run) throw new NotFoundException('Rota de entrega não encontrada.');
    if (!PRE_START.includes(run.status)) throw new ConflictException('Uma rota iniciada não pode ser recalculada ou reordenada silenciosamente.');
    const blockedStop = run.stops.find((stop) => {
      const eligibility = evaluateOwnFleetEligibility(stop.order.marketplaceOrders);
      if (!eligibility.eligible) {
        this.logger.warn({
          event: 'own_fleet_order_blocked', tenantId, orderId: stop.orderId,
          provider: eligibility.provider, deliveryOwnership: eligibility.deliveryOwnership,
          reason: eligibility.reason,
        });
      }
      return !eligibility.eligible;
    });
    if (blockedStop) {
      throw new ConflictException(
        'A rota contém pedido cuja logística não pertence à frota própria da loja.',
      );
    }
    const settings = await this.prisma.tenantSettings.findUnique({ where: { tenantId }, select: { lat: true, lng: true } });
    const origin = coordinates(settings);
    const ordered = optimize && origin ? nearestNeighbor(origin, run.stops) : [...run.stops].sort((a, b) => a.sequence - b.sequence);
    const valid = ordered.flatMap((stop) => { const point = coordinates(stop.addressSnapshot); return point ? [{ stop, point }] : []; });
    let result: RoutingProviderResult | null = null;
    let degraded = valid.length !== ordered.length || !origin;
    if (origin && valid.length === ordered.length && valid.length > 0) {
      try { result = await this.roadRoute(origin, valid.map((item) => item.point)); }
      catch { degraded = true; result = fallbackRoute(origin, valid.map((item) => item.point)); }
    } else if (origin && valid.length > 0) result = fallbackRoute(origin, valid.map((item) => item.point));
    const now = new Date();
    const etaByStop = new Map<string, { distance: number; duration: number; eta: Date }>();
    let cumulativeSeconds = 0;
    valid.forEach(({ stop }, index) => {
      const leg = result?.legs[index];
      if (!leg) return;
      cumulativeSeconds += leg.durationSeconds;
      etaByStop.set(stop.id, { distance: leg.distanceMeters, duration: leg.durationSeconds, eta: new Date(now.getTime() + cumulativeSeconds * 1_000) });
    });
    await this.prisma.$transaction(async (tx) => {
      const routeUpdate = await tx.deliveryRun.updateMany({ where: { id: runId, tenantId, status: { in: PRE_START } }, data: {
        routeProvider: result?.provider ?? 'unavailable', routeQuality: degraded || !result ? 'DEGRADED' : 'ROAD',
        routeGeometry: result ? result.geometry.map((point) => ({ lat: point.lat, lng: point.lng })) : Prisma.JsonNull, routeVersion: { increment: 1 },
        routeDistanceMeters: result?.distanceMeters ?? null, routeDurationSeconds: result?.durationSeconds ?? null,
        routeCalculatedAt: now,
      } });
      if (routeUpdate.count !== 1) {
        throw new ConflictException('A rota foi iniciada enquanto o recálculo estava em andamento.');
      }
      if (optimize) {
        await tx.deliveryStop.updateMany({ where: { tenantId, runId, id: { in: ordered.map((stop) => stop.id) } }, data: { sequence: { increment: 1_000_000 } } });
      }
      for (const [index, stop] of ordered.entries()) {
        const leg = etaByStop.get(stop.id);
        await tx.deliveryStop.updateMany({ where: { id: stop.id, tenantId, runId }, data: {
          ...(optimize ? { sequence: index + 1 } : {}), routeDistanceMeters: leg?.distance ?? null,
          routeDurationSeconds: leg?.duration ?? null, estimatedArrivalAt: leg?.eta ?? null,
        } });
      }
    });
    this.logger.log(JSON.stringify({ tenantId, deliveryRunId: runId, courierId: run.driver.id, provider: result?.provider ?? 'unavailable', stopCount: ordered.length, distanceMeters: result?.distanceMeters ?? null, durationSeconds: result?.durationSeconds ?? null, recalculationReason: reason, degraded: degraded || !result, providerLatencyMs: Date.now() - startedAt, providerStatus: result ? 'ok' : 'unavailable' }));
  }

  private async roadRoute(origin: RoutingCoordinate, stops: RoutingCoordinate[]) {
    const key = JSON.stringify({ origin, stops, provider: process.env.ROUTING_PROVIDER ?? '' });
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.result;
    const result = await this.osrm.route(origin, stops);
    const ttlMs = Number(process.env.ROUTING_CACHE_TTL_MS ?? 300_000);
    this.cache.set(key, { result, expiresAt: Date.now() + (Number.isFinite(ttlMs) ? ttlMs : 300_000) });
    return result;
  }
}

function coordinates(value: unknown): RoutingCoordinate | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const lat = 'lat' in value ? value.lat : null; const lng = 'lng' in value ? value.lng : null;
  return typeof lat === 'number' && Number.isFinite(lat) && lat >= -90 && lat <= 90 && typeof lng === 'number' && Number.isFinite(lng) && lng >= -180 && lng <= 180 ? { lat, lng } : null;
}
function nearestNeighbor(origin: RoutingCoordinate, stops: RouteStop[]) {
  const remaining = [...stops]; const result: RouteStop[] = []; let cursor = origin;
  while (remaining.length) {
    remaining.sort((a, b) => { const ap = coordinates(a.addressSnapshot); const bp = coordinates(b.addressSnapshot); const ad = ap ? calculateDistance(cursor.lat, cursor.lng, ap.lat, ap.lng) : Number.POSITIVE_INFINITY; const bd = bp ? calculateDistance(cursor.lat, cursor.lng, bp.lat, bp.lng) : Number.POSITIVE_INFINITY; return ad - bd || a.sequence - b.sequence || a.id.localeCompare(b.id); });
    const next = remaining.shift(); if (!next) break; result.push(next); cursor = coordinates(next.addressSnapshot) ?? cursor;
  }
  return result;
}
function fallbackRoute(origin: RoutingCoordinate, stops: RoutingCoordinate[]): RoutingProviderResult {
  const points = [origin, ...stops]; const legs = stops.map((stop, index) => { const from = points[index]; const distanceMeters = Math.round(calculateDistance(from.lat, from.lng, stop.lat, stop.lng)); return { distanceMeters, durationSeconds: estimateDeliveryTime(distanceMeters) }; });
  return { provider: 'haversine', geometry: points, legs, distanceMeters: legs.reduce((sum, leg) => sum + leg.distanceMeters, 0), durationSeconds: legs.reduce((sum, leg) => sum + leg.durationSeconds, 0) };
}
