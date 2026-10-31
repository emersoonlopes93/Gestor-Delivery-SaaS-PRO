import { Injectable, Logger } from '@nestjs/common';
import {
  MarketplaceDivergenceStatus,
  MarketplaceDivergenceType,
  MarketplaceProvider,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

export type MarketplaceDivergenceInput = {
  tenantId: string;
  marketplaceOrderId: string;
  internalOrderId?: string | null;
  operationId?: string | null;
  provider: MarketplaceProvider;
  externalOrderId: string;
  type: MarketplaceDivergenceType;
  localState?: string | null;
  remoteState?: string | null;
  reason: string;
  recommendedAction: string;
  correlationId: string;
  lastAttemptAt?: Date | null;
};

@Injectable()
export class MarketplaceDivergenceService {
  private readonly logger = new Logger(MarketplaceDivergenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(input: MarketplaceDivergenceInput) {
    const existing = await this.prisma.marketplaceDivergence.findFirst({
      where: {
        tenantId: input.tenantId,
        marketplaceOrderId: input.marketplaceOrderId,
        operationId: input.operationId ?? null,
        type: input.type,
        status: { in: [MarketplaceDivergenceStatus.OPEN, MarketplaceDivergenceStatus.ACKNOWLEDGED] },
      },
      orderBy: { createdAt: 'desc' },
    });
    const data = {
      internalOrderId: input.internalOrderId ?? null,
      localState: input.localState ?? null,
      remoteState: input.remoteState ?? null,
      reason: input.reason.slice(0, 500),
      recommendedAction: input.recommendedAction.slice(0, 500),
      correlationId: input.correlationId,
      lastAttemptAt: input.lastAttemptAt ?? null,
    };
    const divergence = existing
      ? await this.prisma.marketplaceDivergence.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.marketplaceDivergence.create({
          data: {
            tenantId: input.tenantId,
            marketplaceOrderId: input.marketplaceOrderId,
            internalOrderId: input.internalOrderId ?? null,
            operationId: input.operationId ?? null,
            provider: input.provider,
            externalOrderId: input.externalOrderId,
            type: input.type,
            ...data,
          },
        });
    this.logger.warn({
      message: 'marketplace_divergence_open',
      tenantId: input.tenantId,
      orderId: input.internalOrderId ?? null,
      externalOrderId: input.externalOrderId,
      operationId: input.operationId ?? null,
      correlationId: input.correlationId,
      divergenceType: input.type,
    });
    return divergence;
  }

  async resolveForOperation(tenantId: string, operationId: string, note: string): Promise<void> {
    await this.prisma.marketplaceDivergence.updateMany({
      where: {
        tenantId,
        operationId,
        status: { in: [MarketplaceDivergenceStatus.OPEN, MarketplaceDivergenceStatus.ACKNOWLEDGED] },
      },
      data: {
        status: MarketplaceDivergenceStatus.RESOLVED,
        resolvedAt: new Date(),
        resolutionNote: note.slice(0, 500),
      },
    });
  }
}
