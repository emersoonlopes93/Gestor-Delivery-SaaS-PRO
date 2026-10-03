import { Injectable } from '@nestjs/common';
import type { RoutingCoordinate, RoutingProvider, RoutingProviderResult } from './routing-provider';

interface OsrmResponse {
  code?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: { coordinates?: unknown };
    legs?: Array<{ distance?: number; duration?: number }>;
  }>;
}

@Injectable()
export class OsrmRoutingProvider implements RoutingProvider {
  async route(origin: RoutingCoordinate, stops: RoutingCoordinate[]): Promise<RoutingProviderResult> {
    const baseUrl = process.env.ROUTING_OSRM_BASE_URL?.trim();
    if (process.env.ROUTING_PROVIDER?.trim().toLowerCase() !== 'osrm' || !baseUrl) {
      throw new Error('OSRM routing is not configured');
    }
    const coordinates = [origin, ...stops].map((point) => `${point.lng},${point.lat}`).join(';');
    const url = `${baseUrl.replace(/\/$/, '')}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`;
    const timeoutMs = Number(process.env.ROUTING_TIMEOUT_MS ?? 4_000);
    const response = await fetch(url, { signal: AbortSignal.timeout(Number.isFinite(timeoutMs) ? timeoutMs : 4_000) });
    if (!response.ok) throw new Error(`OSRM status ${response.status}`);
    const payload = await response.json() as OsrmResponse;
    const route = payload.routes?.[0];
    const rawCoordinates = route?.geometry?.coordinates;
    if (payload.code !== 'Ok' || !route || !Array.isArray(rawCoordinates) || !Array.isArray(route.legs) || route.legs.length !== stops.length) {
      throw new Error('Malformed OSRM response');
    }
    const geometry = rawCoordinates.flatMap((value) => Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number'
      ? [{ lat: value[1], lng: value[0] }] : []);
    const legs = route.legs.map((leg) => ({
      distanceMeters: Math.max(0, Math.round(leg.distance ?? 0)),
      durationSeconds: Math.max(1, Math.round(leg.duration ?? 0)),
    }));
    if (geometry.length < 2 || legs.some((leg) => !Number.isFinite(leg.distanceMeters) || !Number.isFinite(leg.durationSeconds))) {
      throw new Error('Malformed OSRM route data');
    }
    return {
      provider: 'osrm', geometry, legs,
      distanceMeters: Math.max(0, Math.round(route.distance ?? legs.reduce((sum, leg) => sum + leg.distanceMeters, 0))),
      durationSeconds: Math.max(1, Math.round(route.duration ?? legs.reduce((sum, leg) => sum + leg.durationSeconds, 0))),
    };
  }
}
