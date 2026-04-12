import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { DeliveryAddressDTO } from '@gestor/types';

export interface DeliveryFeeCalculation {
  fee: number;
  rule: {
    id: string;
    type: string;
    description: string;
  };
}

@Injectable()
export class DeliveryRateService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calcula a taxa de entrega para um tenant e endereço.
   * Prioridade: 1) bairro, 2) distância (se lat/lng), 3) taxa fixa (fallback).
   */
  async calculateDeliveryFee(
    tenantId: string,
    address?: DeliveryAddressDTO | null,
  ): Promise<DeliveryFeeCalculation> {
    // 1. Tentativa por bairro
    if (address?.neighborhood) {
      const neighborhoodRule = await this.prisma.deliveryRateRule.findFirst({
        where: {
          tenantId,
          type: 'neighborhood',
          neighborhood: address.neighborhood.trim().toLowerCase(),
          isActive: true,
        },
      });

      if (neighborhoodRule) {
        return {
          fee: Number(neighborhoodRule.rate),
          rule: {
            id: neighborhoodRule.id,
            type: 'neighborhood',
            description: `Taxa fixa para bairro: ${address.neighborhood}`,
          },
        };
      }
    }

    // 2. Tentativa por distância (requer lat/lng)
    if (address?.lat != null && address?.lng != null) {
      // TODO: Implementar cálculo de distância real (usando API externa ou fórmula de Haversine)
      // Por ora, vamos apenas buscar regras de distância (sem calcular km reais)
      const distanceRules = await this.prisma.deliveryRateRule.findMany({
        where: {
          tenantId,
          type: 'distance',
          isActive: true,
        },
        orderBy: { minKm: 'asc' },
      });

      // Simulação: vamos pegar a primeira faixa encontrada como fallback
      // Em produção, aqui calcularíamos a distância real e encontraríamos a faixa correta
      const firstDistanceRule = distanceRules[0];
      if (firstDistanceRule) {
        return {
          fee: Number(firstDistanceRule.ratePerKm || 0), // Simplificado
          rule: {
            id: firstDistanceRule.id,
            type: 'distance',
            description: `Taxa por distância (faixa ${firstDistanceRule.minKm}-${firstDistanceRule.maxKm} km)`,
          },
        };
      }
    }

    // 3. Taxa fixa (fallback)
    const fixedRule = await this.prisma.deliveryRateRule.findFirst({
      where: {
        tenantId,
        type: 'fixed',
        isActive: true,
      },
    });

    if (fixedRule && fixedRule.fixedRate != null) {
      return {
        fee: Number(fixedRule.fixedRate),
        rule: {
          id: fixedRule.id,
          type: 'fixed',
          description: 'Taxa fixa padrão',
        },
      };
    }

    // 4. Sem regras configuradas: entrega grátis
    return {
      fee: 0,
      rule: {
        id: 'none',
        type: 'none',
        description: 'Sem taxa de entrega configurada',
      },
    };
  }

  /**
   * Lista todas as regras de entrega de um tenant.
   */
  async listRules(tenantId: string) {
    return this.prisma.deliveryRateRule.findMany({
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
      type: 'neighborhood' | 'distance' | 'fixed';
      neighborhood?: string;
      rate?: number;
      minKm?: number;
      maxKm?: number;
      ratePerKm?: number;
      fixedRate?: number;
      isActive?: boolean;
    },
  ) {
    const ruleData: any = {
      tenantId,
      type: data.type,
      isActive: data.isActive ?? true,
    };

    if (data.type === 'neighborhood') {
      if (!data.neighborhood || data.rate == null) {
        throw new NotFoundException('Para regra de bairro, informe neighborhood e rate');
      }
      ruleData.neighborhood = data.neighborhood.trim().toLowerCase();
      ruleData.rate = data.rate;
    } else if (data.type === 'distance') {
      if (data.minKm == null || data.maxKm == null || data.ratePerKm == null) {
        throw new NotFoundException('Para regra de distância, informe minKm, maxKm e ratePerKm');
      }
      ruleData.minKm = data.minKm;
      ruleData.maxKm = data.maxKm;
      ruleData.ratePerKm = data.ratePerKm;
    } else if (data.type === 'fixed') {
      if (data.fixedRate == null) {
        throw new NotFoundException('Para regra fixa, informe fixedRate');
      }
      ruleData.fixedRate = data.fixedRate;
    }

    if (data.id) {
      return this.prisma.deliveryRateRule.update({
        where: { id: data.id },
        data: ruleData,
      });
    } else {
      return this.prisma.deliveryRateRule.create({
        data: ruleData,
      });
    }
  }

  /**
   * Remove uma regra de entrega.
   */
  async deleteRule(tenantId: string, ruleId: string) {
    const rule = await this.prisma.deliveryRateRule.findFirst({
      where: { id: ruleId, tenantId },
    });

    if (!rule) {
      throw new NotFoundException('Regra não encontrada');
    }

    return this.prisma.deliveryRateRule.delete({
      where: { id: ruleId },
    });
  }
}
