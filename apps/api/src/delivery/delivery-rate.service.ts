import { Inject, Injectable, NotFoundException, Logger, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { DeliveryAddressDTO, UpsertDeliveryRateRuleInput } from '@gestor/types';
import { Prisma, DeliveryRateRule } from '@prisma/client';

type DeliveryRateRuleRepo = Prisma.DeliveryRateRuleDelegate;
type DeliveryCoverageRepo = Prisma.DeliveryCoverageConfigDelegate;

export interface DeliveryFeeCalculation {
  fee: number;
  rule: {
    id: string;
    type: string;
    description: string;
  };
}

export type DeliveryMatchedStrategy =
  | 'blocked_zone'
  | 'custom_zone_fixed'
  | 'custom_zone_distance'
  | 'custom_zone_tiers'
  | 'custom_zone_free'
  | 'base_radius'
  | 'out_of_coverage'
  | 'delivery_disabled'
  | 'legacy_rules';

export interface DeliveryDecision {
  canDeliver: boolean;
  matchedStrategy: DeliveryMatchedStrategy;
  matchedZoneId: string | null;
  fee: number;
  distanceKm: number | null;
  reason: string;
  debugInfo?: Record<string, unknown>;
}

export type DeliveryRateRuleType = 'POLYGON' | 'NEIGHBORHOOD' | 'DISTANCE' | 'FIXED';

export interface CalculateDeliveryRateInput {
  tenantId: string;
  address?: Pick<DeliveryAddressDTO, 'neighborhood' | 'lat' | 'lng'> | null;
  distanceKm?: number | null;
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
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLng = Math.sin(dLng / 2);
    const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return R * c;
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
      const legacy = await this.calculateRateLegacy(input);
      return {
        canDeliver: true,
        matchedStrategy: 'legacy_rules',
        matchedZoneId: legacy.rule.id,
        fee: legacy.fee,
        distanceKm: input.distanceKm ?? null,
        reason: legacy.rule.description,
      };
    }

    if (!cfg.isDeliveryEnabled) {
      return {
        canDeliver: false,
        matchedStrategy: 'delivery_disabled',
        matchedZoneId: null,
        fee: 0,
        distanceKm: null,
        reason: 'Entrega desativada',
      };
    }

    const lat = input.address?.lat;
    const lng = input.address?.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new UnprocessableEntityException('Coordenadas (lat/lng) são obrigatórias para calcular entrega.');
    }

    // Use TenantSettings coordinates as priority if available
    const storeLat = typeof settings?.lat === 'number' ? settings.lat : Number(cfg.storeLat);
    const storeLng = typeof settings?.lng === 'number' ? settings.lng : Number(cfg.storeLng);

    const distanceKm =
      typeof input.distanceKm === 'number' && Number.isFinite(input.distanceKm)
        ? input.distanceKm
        : this.haversineDistanceKm({ lat: storeLat, lng: storeLng }, { lat, lng });

    this.logger.debug(`Calculating decision for tenant ${input.tenantId}. Store: ${storeLat},${storeLng}. Customer: ${lat},${lng}. Distance: ${distanceKm}km. MaxRadius: ${cfg.maxRadiusKm}km`);

    const insideRadius = distanceKm <= Number(cfg.maxRadiusKm);

    const zones = await this.prisma.deliveryRateRule.findMany({
      where: {
        tenantId: input.tenantId,
        isActive: true,
        type: 'polygon',
      },
      include: {
        distanceTiers: {
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });

    const point = { lat, lng };

    // 1) Blocked zones
    for (const z of zones) {
      const blocks =
        z.blocksDelivery === true ||
        z.zoneKind === 'blocked_zone';
      if (!blocks) continue;

      const poly = this.getPolygonForRule(z);
      if (!poly || poly.length < 3) continue;
      if (this.isPointInsidePolygon(point, poly)) {
        return {
          canDeliver: false,
          matchedStrategy: 'blocked_zone',
          matchedZoneId: z.id,
          fee: 0,
          distanceKm,
          reason: 'Endereço em área bloqueada para entrega',
        };
      }
    }

    // 2) Custom zones
    for (const z of zones) {
      const blocks =
        z.blocksDelivery === true ||
        z.zoneKind === 'blocked_zone';
      if (blocks) continue;

      const poly = this.getPolygonForRule(z);
      if (!poly || poly.length < 3) continue;
      if (!this.isPointInsidePolygon(point, poly)) continue;

      const pricingMode = z.pricingMode;

      if (pricingMode === 'tiers') {
        const tier = (z.distanceTiers || []).find((t) => {
          const min = Number(t.minDistanceKm);
          const max = Number(t.maxDistanceKm);
          return distanceKm >= min && distanceKm <= max;
        });

        if (tier) {
          return {
            canDeliver: true,
            matchedStrategy: 'custom_zone_tiers',
            matchedZoneId: z.id,
            fee: Number(tier.fee),
            distanceKm,
            reason: `Taxa por faixa de distância (${Number(tier.minDistanceKm).toFixed(1)} a ${Number(tier.maxDistanceKm).toFixed(1)} km)`,
          };
        } else {
          continue; // Não achou faixa, tenta próxima zona ou fallback
        }
      }

      if (pricingMode === 'free') {
        return {
          canDeliver: true,
          matchedStrategy: 'custom_zone_free',
          matchedZoneId: z.id,
          fee: 0,
          distanceKm,
          reason: 'Entrega grátis (zona personalizada)',
        };
      }

      if (pricingMode === 'distance') {
        const pricePerKm = Number(z.pricePerKm ?? 0);
        const feeRaw = pricePerKm * distanceKm;
        const fee = this.clampFee(feeRaw, {
          minimumFee: cfg.minimumFee != null ? Number(cfg.minimumFee) : null,
          maximumFee: cfg.maximumFee != null ? Number(cfg.maximumFee) : null,
        });
        return {
          canDeliver: true,
          matchedStrategy: 'custom_zone_distance',
          matchedZoneId: z.id,
          fee,
          distanceKm,
          reason: 'Taxa por km (zona personalizada)',
        };
      }

      // fixed (default)
      const fixedFee = Number(z.fixedFee ?? z.fixedRate ?? 0);
      const fee = this.clampFee(fixedFee, {
        minimumFee: cfg.minimumFee != null ? Number(cfg.minimumFee) : null,
        maximumFee: cfg.maximumFee != null ? Number(cfg.maximumFee) : null,
      });
      return {
        canDeliver: true,
        matchedStrategy: 'custom_zone_fixed',
        matchedZoneId: z.id,
        fee,
        distanceKm,
        reason: 'Taxa fixa (zona personalizada)',
      };
    }

    // 3) Base radius
    if (insideRadius) {
      const feeRaw = Number(cfg.defaultPricePerKm) * distanceKm;
      const fee = this.clampFee(feeRaw, {
        minimumFee: cfg.minimumFee != null ? Number(cfg.minimumFee) : null,
        maximumFee: cfg.maximumFee != null ? Number(cfg.maximumFee) : null,
      });
      return {
        canDeliver: true,
        matchedStrategy: 'base_radius',
        matchedZoneId: null,
        fee,
        distanceKm,
        reason: 'Taxa base por km',
      };
    }

    // 4) Out of coverage
    return {
      canDeliver: false,
      matchedStrategy: 'out_of_coverage',
      matchedZoneId: null,
      fee: 0,
      distanceKm,
      reason: 'Fora da área de cobertura',
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
    // Prisma enum RateType é lower-case no schema atual.
    // Mantemos o mapeamento para permitir evolução sem quebrar dados existentes.
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
    // Formato padrão aceito: [[lng, lat], [lng, lat], ...]
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
    // Aceita GeoJSON Polygon/MultiPolygon e extrai o anel externo.
    // Para simplificar e manter compatibilidade, usamos apenas o primeiro anel do primeiro polígono.
    if (typeof value !== 'object' || value === null) return null;
    const rec = value as Record<string, unknown>;
    const type = rec['type'];
    const coords = rec['coordinates'];
    if (type === 'Polygon') {
      if (!Array.isArray(coords) || coords.length === 0) return null;
      const ring = coords[0];
      return this.normalizePolygonCoordinates(ring);
    }
    if (type === 'MultiPolygon') {
      if (!Array.isArray(coords) || coords.length === 0) return null;
      const firstPolygon = coords[0];
      if (!Array.isArray(firstPolygon) || firstPolygon.length === 0) return null;
      const ring = firstPolygon[0];
      return this.normalizePolygonCoordinates(ring);
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
    // Ray casting (pnpoly). Considera ponto na borda como dentro.
    // Polygon esperado no formato [ [lng,lat], ... ]
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

      // Checagem de ponto na borda (segmento)
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

      const intersect =
        (yi > y) !== (yj > y) &&
        x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  private getPolygonForRule(rule: DeliveryRateRule): Array<[number, number]> | null {
    const coords = this.normalizePolygonCoordinates(rule.polygonCoordinates);
    if (coords) return coords;
    return this.normalizePolygonFromGeoJson(rule.geoJson);
  }

  private async calculateRateLegacy(input: CalculateDeliveryRateInput): Promise<DeliveryFeeCalculation> {
    const rules = await this.deliveryRateRuleRepo.findMany({
      where: {
        tenantId: input.tenantId,
        isActive: true,
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });

    const addressNeighborhood =
      typeof input.address?.neighborhood === 'string' && input.address.neighborhood.trim() !== ''
        ? this.normalizeNeighborhood(input.address.neighborhood)
        : null;

    const hasPoint =
      typeof input.address?.lat === 'number' &&
      typeof input.address?.lng === 'number' &&
      Number.isFinite(input.address.lat) &&
      Number.isFinite(input.address.lng);
    const distanceKm = input.distanceKm ?? null;

    const candidates: Array<{ id: string; type: DeliveryRateRuleType }> = [];

    const typeOrder: DeliveryRateRuleType[] = ['POLYGON', 'NEIGHBORHOOD', 'DISTANCE', 'FIXED'];

    for (const currentType of typeOrder) {
      for (const rule of rules) {
        const engineType = this.mapDbTypeToEngineType(String(rule.type));
        if (engineType !== currentType) continue;

        let isMatch = false;
        if (engineType === 'POLYGON') {
          if (hasPoint) {
            const poly = this.getPolygonForRule(rule);
            if (poly && poly.length >= 3) {
              if (input.address && typeof input.address.lat === 'number' && typeof input.address.lng === 'number') {
                isMatch = this.isPointInsidePolygon(
                  { lat: input.address.lat, lng: input.address.lng },
                  poly,
                );
              }
            }
          }
        } else if (engineType === 'NEIGHBORHOOD') {
          if (addressNeighborhood && typeof rule.neighborhood === 'string') {
            isMatch = this.normalizeNeighborhood(rule.neighborhood) === addressNeighborhood;
          }
        } else if (engineType === 'DISTANCE') {
          if (typeof distanceKm === 'number' && Number.isFinite(distanceKm)) {
            const distanceKmValue = distanceKm;
            const r = (rule as unknown) as { minDistanceKm: number | null; maxDistanceKm: number | null; minKm: number | null; maxKm: number | null };
            isMatch = this.isDistanceRuleMatch(
              r,
              distanceKmValue,
            );
          }
        } else if (engineType === 'FIXED') {
          isMatch = true;
        }

        if (!isMatch) continue;

        candidates.push({ id: rule.id, type: engineType });

        const fee =
          engineType === 'NEIGHBORHOOD'
            ? Number(rule.rate ?? 0)
            : engineType === 'DISTANCE'
              ? Number(rule.ratePerKm ?? 0) * (typeof distanceKm === 'number' ? distanceKm : 0)
              : engineType === 'POLYGON'
                ? Number(rule.fixedRate ?? rule.rate ?? 0)
                : Number(rule.fixedRate ?? 0);

        if (candidates.length > 1) {
          this.logger.warn(
            `calculateRate conflict: tenantId=${input.tenantId} candidates=${candidates
              .map((c) => `${c.type}:${c.id}`)
              .join(',')}`,
          );
        }

        return {
          fee,
          rule: {
            id: rule.id,
            type: engineType,
            description:
              engineType === 'NEIGHBORHOOD'
                ? `Taxa para bairro: ${rule.neighborhood ?? ''}`
                : engineType === 'DISTANCE'
                  ? 'Taxa por distância'
                  : engineType === 'FIXED'
                    ? 'Taxa fixa padrão'
                    : 'Taxa por polígono',
          },
        };
      }
    }

    const fallback = rules.find(
      (r: (typeof rules)[number]) =>
        'isFallback' in r && (r as { isFallback?: unknown }).isFallback === true,
    );
    if (fallback) {
      const engineType = this.mapDbTypeToEngineType(String(fallback.type)) ?? 'FIXED';
      const fee =
        engineType === 'NEIGHBORHOOD'
          ? Number(fallback.rate ?? 0)
          : engineType === 'DISTANCE'
            ? Number(fallback.ratePerKm ?? 0)
            : Number(fallback.fixedRate ?? 0);
      return {
        fee,
        rule: {
          id: fallback.id,
          type: engineType,
          description: 'Taxa fallback',
        },
      };
    }

    throw new UnprocessableEntityException('Nenhuma regra de taxa de entrega válida e sem fallback configurado.');
  }

  async calculateRate(input: CalculateDeliveryRateInput): Promise<DeliveryFeeCalculation> {
    try {
      const cfg = await this.deliveryCoverageRepo.findUnique({
        where: { tenantId: input.tenantId },
      });

      if (!cfg) {
        return this.calculateRateLegacy(input);
      }

      const decision = await this.calculateDeliveryDecision(input);
      return {
        fee: decision.fee,
        rule: {
          id: decision.matchedZoneId ?? 'base',
          type: decision.matchedStrategy,
          description: decision.reason,
        },
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error calculating delivery rate: ${message}`);
      throw error;
    }
  }

  /**
   * Calcula a taxa de entrega para um tenant e endereço.
   * Prioridade: 1) bairro, 2) distância (se lat/lng), 3) taxa fixa (fallback).
   */
  async calculateDeliveryFee(
    tenantId: string,
    address?: DeliveryAddressDTO | null,
  ): Promise<DeliveryFeeCalculation> {
    // Wrapper retrocompatível (assinatura antiga)
    // distanceKm ainda não é fornecido nesse contrato.
    return this.calculateRate({ tenantId, address, distanceKm: null });
  }

  /**
   * Lista todas as regras de entrega de um tenant.
   */
  async listRules(tenantId: string) {
    return this.deliveryRateRuleRepo.findMany({
      where: { tenantId },
      orderBy: { type: 'asc' },
    });
  }

  /**
   * Cria ou atualiza uma regra de entrega.
   */
  async upsertRule(tenantId: string, data: UpsertDeliveryRateRuleInput) {
    const ruleData: Prisma.DeliveryRateRuleUncheckedCreateInput = {
      tenantId,
      type: data.type,
      isActive: data.isActive ?? true,
      priority: data.priority ?? 1000,
      isFallback: data.isFallback ?? false,
    };

    // Campos opcionais (válidos para qualquer type, mas usados principalmente por polygon/híbrido)
    if (data.name != null) ruleData.name = data.name;
    if (data.color != null) ruleData.color = data.color;
    if (data.zoneKind != null) ruleData.zoneKind = data.zoneKind;
    if (data.pricingMode != null) ruleData.pricingMode = data.pricingMode;
    if (typeof data.blocksDelivery === 'boolean') ruleData.blocksDelivery = data.blocksDelivery;
    if (data.fixedFee != null) ruleData.fixedFee = data.fixedFee;
    if (data.pricePerKm != null) ruleData.pricePerKm = data.pricePerKm;

    if (data.type === 'neighborhood') {
      if (!data.neighborhood || data.rate == null) {
        throw new NotFoundException('Para regra de bairro, informe neighborhood e rate');
      }
      ruleData.neighborhood = data.neighborhood.trim().toLowerCase();
      ruleData.rate = data.rate;
    } else if (data.type === 'distance') {
      if (
        (data.minDistanceKm == null && data.minKm == null) ||
        (data.maxDistanceKm == null && data.maxKm == null) ||
        data.ratePerKm == null
      ) {
        throw new NotFoundException(
          'Para regra de distância, informe minDistanceKm/maxDistanceKm (ou minKm/maxKm) e ratePerKm',
        );
      }

      ruleData.minKm = data.minKm ?? data.minDistanceKm;
      ruleData.maxKm = data.maxKm ?? data.maxDistanceKm;
      ruleData.ratePerKm = data.ratePerKm;

      ruleData.minDistanceKm = data.minDistanceKm ?? data.minKm;
      ruleData.maxDistanceKm = data.maxDistanceKm ?? data.maxKm;
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
          'Para regra de polígono, informe polygonCoordinates (ou geoJson) com no mínimo 3 pontos no formato [[lng,lat],...]',
        );
      }

      ruleData.geoJson = (data.geoJson as Prisma.InputJsonValue) ?? Prisma.JsonNull;
      const polygonJson = this.toInputJsonValue(normalizedCoords);
      if (!polygonJson) {
        throw new UnprocessableEntityException('polygonCoordinates inválido');
      }
      ruleData.polygonCoordinates = polygonJson;

      // Para POLYGON, usamos fixedRate como taxa (mantém compatibilidade com campos existentes)
      if (data.fixedRate != null) {
        ruleData.fixedRate = data.fixedRate;
      } else if (data.rate != null) {
        ruleData.fixedRate = data.rate;
      }

      // Compatibilidade adicional: se fixedFee vier preenchido (novo), refletir também em fixedRate.
      if (data.fixedFee != null && ruleData.fixedRate == null) {
        ruleData.fixedRate = data.fixedFee;
      }

      // Compatibilidade adicional: se pricePerKm vier preenchido (novo), refletir também em ratePerKm.
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

    if (data.type === 'polygon' && ruleId && data.distanceTiers) {
      // Limpa faixas existentes e recria
      await this.prisma.deliveryRateDistanceTier.deleteMany({
        where: { deliveryRateRuleId: ruleId },
      });

      if (data.distanceTiers.length > 0) {
        await this.prisma.deliveryRateDistanceTier.createMany({
          data: data.distanceTiers.map((t, idx) => ({
            tenantId,
            deliveryRateRuleId: ruleId!,
            minDistanceKm: t.minDistanceKm,
            maxDistanceKm: t.maxDistanceKm,
            fee: t.fee,
            sortOrder: t.sortOrder ?? idx,
          })),
        });
      }
    }

    return this.deliveryRateRuleRepo.findUnique({ where: { id: ruleId } });
  }

  /**
   * Remove uma regra de entrega.
   */
  async deleteRule(tenantId: string, ruleId: string) {
    const rule = await this.deliveryRateRuleRepo.findFirst({
      where: { id: ruleId, tenantId },
    });

    if (!rule) {
      throw new NotFoundException('Regra não encontrada');
    }

    return this.deliveryRateRuleRepo.delete({
      where: { id: ruleId },
    });
  }
}
