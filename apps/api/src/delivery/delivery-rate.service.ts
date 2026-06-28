import { Inject, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, DeliveryRateRule } from '@prisma/client';
import type { DeliveryAddressDTO, UpsertDeliveryRateRuleInput } from '@gestor/types';
import { PrismaService } from '../database/prisma.service';
import { GeocodingService } from './geocoding.service';

type DeliveryRateRuleRepo = Prisma.DeliveryRateRuleDelegate;
type DeliveryCoverageRepo = Prisma.DeliveryCoverageConfigDelegate;

export interface DeliveryFeeCalculation {
  fee: number;
  rule: {
    id: string;
    type: string;
    description: string;
  };
  estimatedDeliveryMinutes?: number | null;
  resolvedCoordinates?: { lat: number; lng: number };
}

export type DeliveryMatchedStrategy =
  | 'blocked_zone'
  | 'custom_zone_fixed'
  | 'custom_zone_distance'
  | 'custom_zone_tiers'
  | 'custom_zone_free'
  | 'base_radius'
  | 'out_of_coverage'
  | 'delivery_disabled';

export interface DeliveryDecision {
  canDeliver: boolean;
  available: boolean;
  matchedStrategy: DeliveryMatchedStrategy;
  matchedZoneId: string | null;
  fee: number;
  distanceKm: number | null;
  estimatedDeliveryMinutes: number | null;
  appliedRule: string;
  reason: string;
  resolvedCoordinates?: { lat: number; lng: number };
  debugInfo?: Record<string, unknown>;
}

export type DeliveryRateRuleType = 'POLYGON' | 'NEIGHBORHOOD' | 'DISTANCE' | 'FIXED';

export interface CalculateDeliveryRateInput {
  tenantId: string;
  address?: Partial<DeliveryAddressDTO> | null;
  distanceKm?: number | null;
}

export interface DeliveryTestResult {
  available: boolean;
  distanceKm: number | null;
  fee: number;
  estimatedDeliveryMinutes: number | null;
  appliedRule: string;
  reason?: string;
  matchedZoneId: string | null;
  matchedStrategy: DeliveryMatchedStrategy;
  resolvedCoordinates?: { lat: number; lng: number };
}

export const DELIVERY_RATE_RULE_REPO = 'DELIVERY_RATE_RULE_REPO';
export const DELIVERY_COVERAGE_REPO = 'DELIVERY_COVERAGE_REPO';

@Injectable()
export class DeliveryRateService {
  private readonly logger = new Logger('DeliveryRateService');

  private readonly deliveryRateRuleRepo: DeliveryRateRuleRepo;
  private readonly deliveryCoverageRepo: DeliveryCoverageRepo;

  constructor(
    @Inject(DELIVERY_RATE_RULE_REPO) deliveryRateRuleRepo: DeliveryRateRuleRepo,
    @Inject(DELIVERY_COVERAGE_REPO) deliveryCoverageRepo: DeliveryCoverageRepo,
    private readonly prisma: PrismaService,
    private readonly geocodingService: GeocodingService,
  ) {
    this.deliveryRateRuleRepo = deliveryRateRuleRepo;
    this.deliveryCoverageRepo = deliveryCoverageRepo;
  }

  async hasCoverageConfig(tenantId: string): Promise<boolean> {
    const cfg = await this.deliveryCoverageRepo.findUnique({
      where: { tenantId },
    });
    return cfg != null;
  }

  private haversineDistanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const r = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return r * c;
  }

  private clampFee(
    fee: number,
    cfg: { minimumFee: number | null; maximumFee: number | null },
  ): number {
    let out = fee;
    if (typeof cfg.minimumFee === 'number' && Number.isFinite(cfg.minimumFee)) {
      out = Math.max(out, cfg.minimumFee);
    }
    if (typeof cfg.maximumFee === 'number' && Number.isFinite(cfg.maximumFee)) {
      out = Math.min(out, cfg.maximumFee);
    }
    return out;
  }

  private normalizeEstimatedMinutes(value: number | null | undefined): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const rounded = Math.round(value);
    return rounded > 0 ? rounded : null;
  }

  private buildDecision(input: {
    canDeliver: boolean;
    matchedStrategy: DeliveryMatchedStrategy;
    matchedZoneId: string | null;
    fee: number;
    distanceKm: number | null;
    estimatedDeliveryMinutes?: number | null;
    appliedRule: string;
    reason: string;
    resolvedCoordinates?: { lat: number; lng: number };
    debugInfo?: Record<string, unknown>;
  }): DeliveryDecision {
    return {
      canDeliver: input.canDeliver,
      available: input.canDeliver,
      matchedStrategy: input.matchedStrategy,
      matchedZoneId: input.matchedZoneId,
      fee: input.fee,
      distanceKm: input.distanceKm,
      estimatedDeliveryMinutes: this.normalizeEstimatedMinutes(input.estimatedDeliveryMinutes),
      appliedRule: input.appliedRule,
      reason: input.reason,
      resolvedCoordinates: input.resolvedCoordinates,
      debugInfo: input.debugInfo,
    };
  }

  private describeDistanceTier(minDistanceKm: number, maxDistanceKm: number): string {
    return `Raio de ${minDistanceKm.toFixed(1)} a ${maxDistanceKm.toFixed(1)} km`;
  }

  private describeZoneRule(name: string | null | undefined, fallback: string): string {
    const normalized = name?.trim();
    return normalized ? `Area especial: ${normalized}` : fallback;
  }

  private getDefaultEstimatedMinutes(
    cfg: { defaultEstimatedDeliveryMinutes: Prisma.Decimal | number | null },
  ): number | null {
    if (cfg.defaultEstimatedDeliveryMinutes == null) return null;
    return this.normalizeEstimatedMinutes(Number(cfg.defaultEstimatedDeliveryMinutes));
  }

  async calculateDeliveryDecision(input: CalculateDeliveryRateInput): Promise<DeliveryDecision> {
    const [cfg, settings] = await Promise.all([
      this.prisma.deliveryCoverageConfig.findUnique({
        where: { tenantId: input.tenantId },
      }),
      this.prisma.tenantSettings.findUnique({
        where: { tenantId: input.tenantId },
        select: { lat: true, lng: true },
      }),
    ]);

    if (!cfg) {
      throw new UnprocessableEntityException('Nenhuma zona de entrega configurada para este estabelecimento.');
    }

    if (!cfg.isDeliveryEnabled) {
      return this.buildDecision({
        canDeliver: false,
        matchedStrategy: 'delivery_disabled',
        matchedZoneId: null,
        fee: 0,
        distanceKm: null,
        estimatedDeliveryMinutes: null,
        appliedRule: 'Entrega desativada',
        reason: 'Entrega desativada',
      });
    }

    let lat = input.address?.lat;
    let lng = input.address?.lng;
    let resolvedCoordinates: { lat: number; lng: number } | undefined;

    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      const addr = input.address;
      if (addr && addr.street && addr.number && addr.neighborhood) {
        const fullAddress = `${addr.street}, ${addr.number} - ${addr.neighborhood}, ${addr.city || ''} ${addr.state || ''}`;
        const coords = await this.geocodingService.geocodeAddress(fullAddress);
        if (coords) {
          lat = coords.lat;
          lng = coords.lng;
          resolvedCoordinates = coords;
        }
      }

      if (typeof lat !== 'number' || typeof lng !== 'number') {
        throw new UnprocessableEntityException(
          'Nao foi possivel localizar o endereco. Revise rua, numero, bairro e cidade ou informe as coordenadas.',
        );
      }
    }

    const storeLat = typeof settings?.lat === 'number' ? settings.lat : Number(cfg.storeLat);
    const storeLng = typeof settings?.lng === 'number' ? settings.lng : Number(cfg.storeLng);

    if (Math.abs(storeLat - (-23.55052)) < 0.00001 && Math.abs(storeLng - (-46.633308)) < 0.00001) {
      return this.buildDecision({
        canDeliver: false,
        matchedStrategy: 'delivery_disabled',
        matchedZoneId: null,
        fee: 0,
        distanceKm: null,
        estimatedDeliveryMinutes: null,
        appliedRule: 'Origem da loja nao configurada',
        reason: 'Configure o endereco da loja para calcular corretamente as taxas de entrega.',
      });
    }

    const distanceKm =
      typeof input.distanceKm === 'number' && Number.isFinite(input.distanceKm)
        ? input.distanceKm
        : this.haversineDistanceKm({ lat: storeLat, lng: storeLng }, { lat, lng });

    this.logger.debug(
      `Calculating decision for tenant ${input.tenantId}. Store: ${storeLat},${storeLng}. Customer: ${lat},${lng}. Distance: ${distanceKm}km. MaxRadius: ${cfg.maxRadiusKm}km`,
    );

    const insideRadius = distanceKm <= Number(cfg.maxRadiusKm);
    const defaultEstimatedMinutes = this.getDefaultEstimatedMinutes(cfg);

    const zones = await this.prisma.deliveryRateRule.findMany({
      where: {
        tenantId: input.tenantId,
        isActive: true,
        type: { in: ['polygon', 'distance'] },
      },
      include: {
        distanceTiers: {
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });

    const point = { lat, lng };

    for (const zone of zones) {
      const blocks = zone.blocksDelivery === true || zone.zoneKind === 'blocked_zone';
      if (!blocks) continue;

      const poly = this.getPolygonForRule(zone);
      if (!poly || poly.length < 3) continue;
      if (!this.isPointInsidePolygon(point, poly)) continue;

      return this.buildDecision({
        canDeliver: false,
        matchedStrategy: 'blocked_zone',
        matchedZoneId: zone.id,
        fee: 0,
        distanceKm,
        estimatedDeliveryMinutes: null,
        appliedRule: this.describeZoneRule(zone.name, 'Area bloqueada'),
        reason: 'Endereco em area bloqueada para entrega',
      });
    }

    for (const zone of zones) {
      if (zone.blocksDelivery === true || zone.zoneKind === 'blocked_zone') continue;
      if (zone.type !== 'polygon') continue;

      const poly = this.getPolygonForRule(zone);
      if (!poly || poly.length < 3) continue;
      if (!this.isPointInsidePolygon(point, poly)) continue;

      const zoneEstimatedMinutes = this.normalizeEstimatedMinutes(
        zone.estimatedDeliveryMinutes != null ? Number(zone.estimatedDeliveryMinutes) : defaultEstimatedMinutes,
      );

      if (zone.pricingMode === 'tiers') {
        const tier = (zone.distanceTiers || []).find((item) => {
          const min = Number(item.minDistanceKm);
          const max = Number(item.maxDistanceKm);
          return distanceKm >= min && distanceKm <= max;
        });
        if (!tier) continue;

        const min = Number(tier.minDistanceKm);
        const max = Number(tier.maxDistanceKm);
        return this.buildDecision({
          canDeliver: true,
          matchedStrategy: 'custom_zone_tiers',
          matchedZoneId: zone.id,
          fee: Number(tier.fee),
          distanceKm,
          estimatedDeliveryMinutes: this.normalizeEstimatedMinutes(
            tier.estimatedDeliveryMinutes != null ? Number(tier.estimatedDeliveryMinutes) : zoneEstimatedMinutes,
          ),
          appliedRule: this.describeZoneRule(zone.name, this.describeDistanceTier(min, max)),
          reason: `Taxa por faixa de distancia (${min.toFixed(1)} a ${max.toFixed(1)} km)`,
        });
      }

      if (zone.pricingMode === 'free') {
        return this.buildDecision({
          canDeliver: true,
          matchedStrategy: 'custom_zone_free',
          matchedZoneId: zone.id,
          fee: 0,
          distanceKm,
          estimatedDeliveryMinutes: zoneEstimatedMinutes,
          appliedRule: this.describeZoneRule(zone.name, 'Area com entrega gratis'),
          reason: 'Entrega gratis (area especial)',
        });
      }

      if (zone.pricingMode === 'distance') {
        const feeRaw = Number(zone.pricePerKm ?? 0) * distanceKm;
        const fee = this.clampFee(feeRaw, {
          minimumFee: cfg.minimumFee != null ? Number(cfg.minimumFee) : null,
          maximumFee: cfg.maximumFee != null ? Number(cfg.maximumFee) : null,
        });
        return this.buildDecision({
          canDeliver: true,
          matchedStrategy: 'custom_zone_distance',
          matchedZoneId: zone.id,
          fee,
          distanceKm,
          estimatedDeliveryMinutes: zoneEstimatedMinutes,
          appliedRule: this.describeZoneRule(zone.name, 'Area com taxa por km'),
          reason: 'Taxa por km (area especial)',
        });
      }

      const fixedFee = Number(zone.fixedFee ?? zone.fixedRate ?? 0);
      const fee = this.clampFee(fixedFee, {
        minimumFee: cfg.minimumFee != null ? Number(cfg.minimumFee) : null,
        maximumFee: cfg.maximumFee != null ? Number(cfg.maximumFee) : null,
      });
      return this.buildDecision({
        canDeliver: true,
        matchedStrategy: 'custom_zone_fixed',
        matchedZoneId: zone.id,
        fee,
        distanceKm,
        estimatedDeliveryMinutes: zoneEstimatedMinutes,
        appliedRule: this.describeZoneRule(zone.name, 'Area com taxa fixa'),
        reason: 'Taxa fixa (area especial)',
      });
    }

    for (const zone of zones) {
      if (zone.blocksDelivery === true || zone.zoneKind === 'blocked_zone') continue;
      if (zone.type !== 'distance' || zone.pricingMode !== 'tiers') continue;
      if (cfg.maxRadiusKm != null && distanceKm > Number(cfg.maxRadiusKm)) continue;

      const tier = (zone.distanceTiers || []).find((item) => {
        const min = Number(item.minDistanceKm);
        const max = Number(item.maxDistanceKm);
        return distanceKm >= min && distanceKm <= max;
      });
      if (!tier) continue;

      const min = Number(tier.minDistanceKm);
      const max = Number(tier.maxDistanceKm);
      return this.buildDecision({
        canDeliver: true,
        matchedStrategy: 'custom_zone_tiers',
        matchedZoneId: zone.id,
        fee: Number(tier.fee),
        distanceKm,
        estimatedDeliveryMinutes: this.normalizeEstimatedMinutes(
          tier.estimatedDeliveryMinutes != null
            ? Number(tier.estimatedDeliveryMinutes)
            : zone.estimatedDeliveryMinutes != null
              ? Number(zone.estimatedDeliveryMinutes)
              : defaultEstimatedMinutes,
        ),
        appliedRule: this.describeDistanceTier(min, max),
        reason: `Taxa por faixa de distancia (${min.toFixed(1)} a ${max.toFixed(1)} km)`,
      });
    }

    if (insideRadius) {
      const feeRaw = Number(cfg.defaultPricePerKm) * distanceKm;
      const fee = this.clampFee(feeRaw, {
        minimumFee: cfg.minimumFee != null ? Number(cfg.minimumFee) : null,
        maximumFee: cfg.maximumFee != null ? Number(cfg.maximumFee) : null,
      });
      return this.buildDecision({
        canDeliver: true,
        matchedStrategy: 'base_radius',
        matchedZoneId: null,
        fee,
        distanceKm,
        estimatedDeliveryMinutes: defaultEstimatedMinutes,
        appliedRule: 'Cobertura padrao por raio',
        reason: 'Taxa base por km',
      });
    }

    return this.buildDecision({
      canDeliver: false,
      matchedStrategy: 'out_of_coverage',
      matchedZoneId: null,
      fee: 0,
      distanceKm,
      estimatedDeliveryMinutes: null,
      appliedRule: 'Fora da area de entrega',
      reason: 'Fora da area de cobertura',
      resolvedCoordinates,
    });
  }

  async testDeliveryByQuery(tenantId: string, query: string): Promise<DeliveryTestResult> {
    const trimmed = query.trim();
    if (!trimmed) {
      throw new UnprocessableEntityException('Informe um endereco ou CEP para testar a entrega.');
    }

    const coords = await this.geocodingService.geocodeFreeform(trimmed);
    if (!coords) {
      throw new UnprocessableEntityException('Nao foi possivel localizar o endereco informado.');
    }

    const decision = await this.calculateDeliveryDecision({
      tenantId,
      address: {
        street: trimmed,
        number: '0',
        neighborhood: 'Teste',
        city: '',
        state: '',
        lat: coords.lat,
        lng: coords.lng,
      },
      distanceKm: null,
    });

    return {
      available: decision.available,
      distanceKm: decision.distanceKm,
      fee: decision.fee,
      estimatedDeliveryMinutes: decision.estimatedDeliveryMinutes,
      appliedRule: decision.appliedRule,
      reason: decision.available ? undefined : decision.reason,
      matchedZoneId: decision.matchedZoneId,
      matchedStrategy: decision.matchedStrategy,
      resolvedCoordinates: decision.resolvedCoordinates ?? coords,
    };
  }

  private toInputJsonValue(value: unknown): Prisma.InputJsonValue | undefined {
    const isPrimitive =
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean';
    if (value === null) return undefined;
    if (isPrimitive) return value;

    if (Array.isArray(value)) {
      const mapped: Prisma.InputJsonValue[] = [];
      for (const item of value) {
        const conv = this.toInputJsonValue(item);
        if (conv === undefined) return undefined;
        mapped.push(conv);
      }
      return mapped;
    }

    if (typeof value === 'object' && value !== null) {
      const out: Record<string, Prisma.InputJsonValue> = {};
      for (const [k, v] of Object.entries(value)) {
        const conv = this.toInputJsonValue(v);
        if (conv === undefined) return undefined;
        out[k] = conv;
      }
      return out;
    }

    return undefined;
  }

  private normalizeNeighborhood(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  private mapDbTypeToEngineType(dbType: string): DeliveryRateRuleType | null {
    if (dbType === 'polygon') return 'POLYGON';
    if (dbType === 'neighborhood') return 'NEIGHBORHOOD';
    if (dbType === 'distance') return 'DISTANCE';
    if (dbType === 'fixed') return 'FIXED';
    return null;
  }

  private isDistanceRuleMatch(
    rule: { minDistanceKm: number | null; maxDistanceKm: number | null; minKm: number | null; maxKm: number | null },
    distanceKm: number,
  ): boolean {
    const min = rule.minDistanceKm ?? rule.minKm;
    const max = rule.maxDistanceKm ?? rule.maxKm;
    if (min != null && distanceKm < min) return false;
    if (max != null && distanceKm > max) return false;
    return true;
  }

  private normalizePolygonCoordinates(value: unknown): Array<[number, number]> | null {
    if (!Array.isArray(value)) return null;
    const out: Array<[number, number]> = [];
    for (const item of value) {
      if (!Array.isArray(item) || item.length < 2) return null;
      const lng = item[0];
      const lat = item[1];
      if (typeof lng !== 'number' || typeof lat !== 'number') return null;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      out.push([lng, lat]);
    }
    return out;
  }

  private normalizePolygonFromGeoJson(value: unknown): Array<[number, number]> | null {
    if (typeof value !== 'object' || value === null) return null;
    const rec = value as Record<string, unknown>;
    const type = rec['type'];
    const coords = rec['coordinates'];
    if (type === 'Polygon') {
      if (!Array.isArray(coords) || coords.length === 0) return null;
      return this.normalizePolygonCoordinates(coords[0]);
    }
    if (type === 'MultiPolygon') {
      if (!Array.isArray(coords) || coords.length === 0) return null;
      const firstPolygon = coords[0];
      if (!Array.isArray(firstPolygon) || firstPolygon.length === 0) return null;
      return this.normalizePolygonCoordinates(firstPolygon[0]);
    }
    return null;
  }

  private ensureRingClosed(points: Array<[number, number]>): Array<[number, number]> {
    if (points.length === 0) return points;
    const [firstLng, firstLat] = points[0];
    const [lastLng, lastLat] = points[points.length - 1];
    if (firstLng === lastLng && firstLat === lastLat) return points;
    return [...points, [firstLng, firstLat]];
  }

  private isPointInsidePolygon(
    point: { lat: number; lng: number },
    polygon: Array<[number, number]>,
  ): boolean {
    if (polygon.length < 3) return false;

    const ring = this.ensureRingClosed(polygon);
    const x = point.lng;
    const y = point.lat;

    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];

      const onSegment = (() => {
        const minX = Math.min(xi, xj);
        const maxX = Math.max(xi, xj);
        const minY = Math.min(yi, yj);
        const maxY = Math.max(yi, yj);
        const cross = (x - xi) * (yj - yi) - (y - yi) * (xj - xi);
        if (Math.abs(cross) > 1e-12) return false;
        if (x < minX - 1e-12 || x > maxX + 1e-12) return false;
        if (y < minY - 1e-12 || y > maxY + 1e-12) return false;
        return true;
      })();
      if (onSegment) return true;

      const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  private getPolygonForRule(rule: DeliveryRateRule): Array<[number, number]> | null {
    const coords = this.normalizePolygonCoordinates(rule.polygonCoordinates);
    if (coords) return coords;
    return this.normalizePolygonFromGeoJson(rule.geoJson);
  }

  async calculateRate(input: CalculateDeliveryRateInput): Promise<DeliveryFeeCalculation> {
    try {
      const decision = await this.calculateDeliveryDecision(input);
      return {
        fee: decision.fee,
        rule: {
          id: decision.matchedZoneId ?? 'base',
          type: decision.matchedStrategy,
          description: decision.reason,
        },
        estimatedDeliveryMinutes: decision.estimatedDeliveryMinutes,
        resolvedCoordinates: decision.resolvedCoordinates,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error calculating delivery rate: ${message}`);
      throw error;
    }
  }

  async calculateDeliveryFee(
    tenantId: string,
    address?: DeliveryAddressDTO | null,
  ): Promise<DeliveryFeeCalculation> {
    return this.calculateRate({ tenantId, address, distanceKm: null });
  }

  async listRules(tenantId: string) {
    return this.deliveryRateRuleRepo.findMany({
      where: { tenantId },
      include: {
        distanceTiers: {
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: [{ type: 'asc' }, { priority: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async upsertRule(tenantId: string, data: UpsertDeliveryRateRuleInput) {
    const ruleData: Prisma.DeliveryRateRuleUncheckedCreateInput = {
      tenantId,
      type: data.type,
      isActive: data.isActive ?? true,
      priority: data.priority ?? 1000,
      isFallback: data.isFallback ?? false,
    };

    if (data.name != null) ruleData.name = data.name;
    if (data.color != null) ruleData.color = data.color;
    if (data.zoneKind != null) ruleData.zoneKind = data.zoneKind;
    if (data.pricingMode != null) ruleData.pricingMode = data.pricingMode;
    if (typeof data.blocksDelivery === 'boolean') ruleData.blocksDelivery = data.blocksDelivery;
    if (data.fixedFee != null) ruleData.fixedFee = data.fixedFee;
    if (data.pricePerKm != null) ruleData.pricePerKm = data.pricePerKm;
    if (data.estimatedDeliveryMinutes != null) {
      ruleData.estimatedDeliveryMinutes = Math.round(data.estimatedDeliveryMinutes);
    }

    if (data.type === 'neighborhood') {
      if (!data.neighborhood || data.rate == null) {
        throw new NotFoundException('Para regra de bairro, informe neighborhood e rate');
      }
      ruleData.neighborhood = this.normalizeNeighborhood(data.neighborhood);
      ruleData.rate = data.rate;
    } else if (data.type === 'distance') {
      if (
        data.pricingMode !== 'tiers' &&
        ((data.minDistanceKm == null && data.minKm == null) ||
          (data.maxDistanceKm == null && data.maxKm == null) ||
          data.ratePerKm == null)
      ) {
        throw new NotFoundException(
          'Para regra de distancia, informe minDistanceKm/maxDistanceKm (ou minKm/maxKm) e ratePerKm',
        );
      }

      if (data.pricingMode !== 'tiers') {
        ruleData.minKm = data.minKm ?? data.minDistanceKm;
        ruleData.maxKm = data.maxKm ?? data.maxDistanceKm;
        ruleData.ratePerKm = data.ratePerKm;
        ruleData.minDistanceKm = data.minDistanceKm ?? data.minKm;
        ruleData.maxDistanceKm = data.maxDistanceKm ?? data.maxKm;
      }
    } else if (data.type === 'fixed') {
      if (data.fixedRate == null) {
        throw new NotFoundException('Para regra fixa, informe fixedRate');
      }
      ruleData.fixedRate = data.fixedRate;
    } else if (data.type === 'polygon') {
      const normalizedCoords =
        this.normalizePolygonCoordinates(data.polygonCoordinates) ??
        this.normalizePolygonFromGeoJson(data.geoJson);

      if (!normalizedCoords || normalizedCoords.length < 3) {
        throw new UnprocessableEntityException(
          'Para regra de poligono, informe polygonCoordinates (ou geoJson) com no minimo 3 pontos no formato [[lng,lat],...]',
        );
      }

      ruleData.geoJson = (data.geoJson as Prisma.InputJsonValue) ?? Prisma.JsonNull;
      const polygonJson = this.toInputJsonValue(normalizedCoords);
      if (!polygonJson) {
        throw new UnprocessableEntityException('polygonCoordinates invalido');
      }
      ruleData.polygonCoordinates = polygonJson;

      if (data.fixedRate != null) {
        ruleData.fixedRate = data.fixedRate;
      } else if (data.rate != null) {
        ruleData.fixedRate = data.rate;
      }

      if (data.fixedFee != null && ruleData.fixedRate == null) {
        ruleData.fixedRate = data.fixedFee;
      }
      if (data.pricePerKm != null && ruleData.ratePerKm == null) {
        ruleData.ratePerKm = data.pricePerKm;
      }
    }

    let ruleId = data.id;

    if (ruleId) {
      await this.deliveryRateRuleRepo.update({
        where: { id: ruleId },
        data: ruleData,
      });
    } else {
      const created = await this.deliveryRateRuleRepo.create({
        data: ruleData,
      });
      ruleId = created.id;
    }

    if ((data.type === 'polygon' || data.type === 'distance') && ruleId && data.distanceTiers) {
      if (data.distanceTiers.length > 0) {
        const sortedTiers = [...data.distanceTiers].sort((a, b) => Number(a.minDistanceKm) - Number(b.minDistanceKm));
        for (let i = 0; i < sortedTiers.length; i++) {
          const tier = sortedTiers[i];
          if (tier.minDistanceKm < 0) {
            throw new UnprocessableEntityException('A distancia minima nao pode ser negativa.');
          }
          if (tier.fee < 0) {
            throw new UnprocessableEntityException('A taxa de entrega nao pode ser negativa.');
          }
          if (tier.maxDistanceKm <= tier.minDistanceKm) {
            throw new UnprocessableEntityException(
              `A distancia maxima (${tier.maxDistanceKm}km) deve ser maior que a minima (${tier.minDistanceKm}km).`,
            );
          }
          if (
            tier.estimatedDeliveryMinutes != null &&
            (!Number.isInteger(tier.estimatedDeliveryMinutes) || tier.estimatedDeliveryMinutes <= 0)
          ) {
            throw new UnprocessableEntityException('O tempo estimado deve ser um inteiro maior que zero.');
          }
          if (i > 0) {
            const prev = sortedTiers[i - 1];
            if (tier.minDistanceKm < prev.maxDistanceKm) {
              throw new UnprocessableEntityException(
                `Sobreposicao detectada: a faixa de ${tier.minDistanceKm} a ${tier.maxDistanceKm}km sobrepoe a faixa anterior de ${prev.minDistanceKm} a ${prev.maxDistanceKm}km.`,
              );
            }
          }
        }
      }

      await this.prisma.deliveryRateDistanceTier.deleteMany({
        where: { deliveryRateRuleId: ruleId },
      });

      if (data.distanceTiers.length > 0) {
        await this.prisma.deliveryRateDistanceTier.createMany({
          data: data.distanceTiers.map((tier, idx) => ({
            tenantId,
            deliveryRateRuleId: ruleId!,
            minDistanceKm: tier.minDistanceKm,
            maxDistanceKm: tier.maxDistanceKm,
            fee: tier.fee,
            estimatedDeliveryMinutes:
              tier.estimatedDeliveryMinutes != null ? Math.round(tier.estimatedDeliveryMinutes) : null,
            sortOrder: tier.sortOrder ?? idx,
          })),
        });
      }
    }

    return this.deliveryRateRuleRepo.findUnique({
      where: { id: ruleId },
      include: {
        distanceTiers: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  async deleteRule(tenantId: string, ruleId: string) {
    const rule = await this.deliveryRateRuleRepo.findFirst({
      where: { id: ruleId, tenantId },
    });

    if (!rule) {
      throw new NotFoundException('Regra nao encontrada');
    }

    return this.deliveryRateRuleRepo.delete({
      where: { id: ruleId },
    });
  }
}
