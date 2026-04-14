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
      isDeliveryEnabled: data.isDeliveryEnabled ?? true,
    };

    return this.prisma.deliveryCoverageConfig.upsert({
      where: { tenantId },
      create: payload,
      update: payload,
    });
  }
}
