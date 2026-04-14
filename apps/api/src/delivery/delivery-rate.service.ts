import { Injectable, NotFoundException, Logger, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { DeliveryAddressDTO } from '@gestor/types';
import { Prisma } from '@prisma/client';
import type { DeliveryRateRule } from '@prisma/client';

export interface DeliveryFeeCalculation {
  fee: number;
  rule: {
    id: string;
    type: string;
    description: string;
  };
}

export type DeliveryRateRuleType = 'POLYGON' | 'NEIGHBORHOOD' | 'DISTANCE' | 'FIXED';

export interface CalculateDeliveryRateInput {
  tenantId: string;
  address?: Pick<DeliveryAddressDTO, 'neighborhood' | 'lat' | 'lng'> | null;
  distanceKm?: number | null;
}

@Injectable()
export class DeliveryRateService {
  private readonly logger = new Logger('DeliveryRateService');

  private readonly deliveryRateRuleRepo: {
    findMany: (args?: Prisma.DeliveryRateRuleFindManyArgs) => PromiseLike<DeliveryRateRule[]>;
    findFirst: (args: Prisma.DeliveryRateRuleFindFirstArgs) => PromiseLike<DeliveryRateRule | null>;
    create: (args: Prisma.DeliveryRateRuleCreateArgs) => PromiseLike<DeliveryRateRule>;
    update: (args: Prisma.DeliveryRateRuleUpdateArgs) => PromiseLike<DeliveryRateRule>;
    delete: (args: Prisma.DeliveryRateRuleDeleteArgs) => PromiseLike<DeliveryRateRule>;
  };

  constructor(
    prisma: PrismaService,
  ) {
    this.deliveryRateRuleRepo = prisma.deliveryRateRule;
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
    rule: { minDistanceKm: unknown; maxDistanceKm: unknown; minKm: unknown; maxKm: unknown },
    distanceKm: number,
  ): boolean {
    const min =
      typeof rule.minDistanceKm === 'number'
        ? rule.minDistanceKm
        : typeof rule.minKm === 'number'
          ? rule.minKm
          : null;
    const max =
      typeof rule.maxDistanceKm === 'number'
        ? rule.maxDistanceKm
        : typeof rule.maxKm === 'number'
          ? rule.maxKm
          : null;

    if (min != null && distanceKm < min) return false;
    if (max != null && distanceKm > max) return false;
    return true;
  }

  private isPointInsidePolygon(): boolean {
    // Stub: suporte estrutural apenas (sem lógica ainda)
    return false;
  }

  async calculateRate(input: CalculateDeliveryRateInput): Promise<DeliveryFeeCalculation> {
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

    const hasPoint = input.address?.lat != null && input.address?.lng != null;
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
            isMatch = this.isPointInsidePolygon();
          }
        } else if (engineType === 'NEIGHBORHOOD') {
          if (addressNeighborhood && typeof rule.neighborhood === 'string') {
            isMatch = this.normalizeNeighborhood(rule.neighborhood) === addressNeighborhood;
          }
        } else if (engineType === 'DISTANCE') {
          if (typeof distanceKm === 'number' && Number.isFinite(distanceKm)) {
            const distanceKmValue = distanceKm;
            isMatch = this.isDistanceRuleMatch(
              {
                minDistanceKm:
                  'minDistanceKm' in rule && (rule as { minDistanceKm?: unknown }).minDistanceKm != null
                    ? Number((rule as { minDistanceKm?: unknown }).minDistanceKm)
                    : null,
                maxDistanceKm:
                  'maxDistanceKm' in rule && (rule as { maxDistanceKm?: unknown }).maxDistanceKm != null
                    ? Number((rule as { maxDistanceKm?: unknown }).maxDistanceKm)
                    : null,
                minKm: rule.minKm != null ? Number(rule.minKm) : null,
                maxKm: rule.maxKm != null ? Number(rule.maxKm) : null,
              },
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
  async upsertRule(
    tenantId: string,
    data: {
      id?: string;
      type: 'neighborhood' | 'distance' | 'fixed' | 'polygon';
      neighborhood?: string;
      rate?: number;
      minKm?: number;
      maxKm?: number;
      ratePerKm?: number;
      fixedRate?: number;
      isActive?: boolean;
      priority?: number;
      isFallback?: boolean;
      minDistanceKm?: number;
      maxDistanceKm?: number;
      geoJson?: Prisma.InputJsonValue;
      polygonCoordinates?: Prisma.InputJsonValue;
    },
  ) {
    const ruleData: Prisma.DeliveryRateRuleUncheckedCreateInput = {
      tenantId,
      type: data.type,
      isActive: data.isActive ?? true,
      priority: data.priority ?? 1000,
      isFallback: data.isFallback ?? false,
    };

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
      ruleData.geoJson = data.geoJson ?? Prisma.JsonNull;
      ruleData.polygonCoordinates = data.polygonCoordinates ?? Prisma.JsonNull;
    }

    if (data.id) {
      return this.deliveryRateRuleRepo.update({
        where: { id: data.id },
        data: ruleData,
      });
    } else {
      return this.deliveryRateRuleRepo.create({
        data: ruleData,
      });
    }
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
