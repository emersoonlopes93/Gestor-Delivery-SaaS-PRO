import { Injectable } from '@nestjs/common';
import type { DeliveryCoverageConfig, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class DeliveryCoverageService {
  constructor(private readonly prisma: PrismaService) {}

  async getCoverageConfig(tenantId: string): Promise<DeliveryCoverageConfig | null> {
    return this.prisma.deliveryCoverageConfig.findUnique({
      where: { tenantId },
    });
  }

  async upsertCoverageConfig(
    tenantId: string,
    data: {
      storeLat: number;
      storeLng: number;
      maxRadiusKm: number;
      defaultPricePerKm: number;
      minimumFee?: number;
      maximumFee?: number;
      defaultEstimatedDeliveryMinutes?: number;
      isDeliveryEnabled?: boolean;
    },
  ): Promise<DeliveryCoverageConfig> {
    const payload: Prisma.DeliveryCoverageConfigUncheckedCreateInput = {
      tenantId,
      storeLat: data.storeLat,
      storeLng: data.storeLng,
      maxRadiusKm: data.maxRadiusKm,
      defaultPricePerKm: data.defaultPricePerKm,
      minimumFee: data.minimumFee,
      maximumFee: data.maximumFee,
      defaultEstimatedDeliveryMinutes: data.defaultEstimatedDeliveryMinutes,
      isDeliveryEnabled: data.isDeliveryEnabled ?? true,
    };

    const [coverage] = await this.prisma.$transaction([
      this.prisma.deliveryCoverageConfig.upsert({
        where: { tenantId },
        create: payload,
        update: payload,
      }),
      this.prisma.tenantSettings.upsert({
        where: { tenantId },
        create: {
          tenantId,
          timezone: 'America/Sao_Paulo',
          currency: 'BRL',
          language: 'pt-BR',
          lat: data.storeLat,
          lng: data.storeLng,
        },
        update: {
          lat: data.storeLat,
          lng: data.storeLng,
        },
      }),
    ]);

    return coverage;
  }
}
