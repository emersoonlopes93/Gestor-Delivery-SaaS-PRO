import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, Optional } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { MarketplaceProvider } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { MARKETPLACE_EVENT_QUEUE } from '../marketplace.constants';
import { MarketplaceProviderRegistryService } from './marketplace-provider-registry.service';

@Injectable()
export class MarketplaceStatusSyncService {
  private readonly logger = new Logger(MarketplaceStatusSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: MarketplaceProviderRegistryService,
    @Optional() @InjectQueue(MARKETPLACE_EVENT_QUEUE) private readonly queue?: Queue,
  ) {}

  async handleInternalStatusChanged(input: {
    tenantId: string;
    orderId: string;
    status: string;
    reason?: string | null;
  }) {
    if (!['confirmed', 'cancelled'].includes(input.status)) return;

    const marketplaceOrder = await this.prisma.marketplaceOrder.findFirst({
      where: { tenantId: input.tenantId, internalOrderId: input.orderId },
    });
    if (!marketplaceOrder) return;

    if (this.queue) {
      await this.queue.add('order-status-sync', {
        tenantId: input.tenantId,
        orderId: input.orderId,
        status: input.status,
        reason: input.reason ?? null,
      });
      return;
    }

    await this.processStatusSyncJob({
      tenantId: input.tenantId,
      orderId: input.orderId,
      status: input.status,
      reason: input.reason ?? null,
    });
  }

  async processStatusSyncJob(input: {
    tenantId: string;
    orderId: string;
    status: string;
    reason?: string | null;
  }) {
    const marketplaceOrder = await this.prisma.marketplaceOrder.findFirst({
      where: {
        tenantId: input.tenantId,
        internalOrderId: input.orderId,
      },
      include: { connection: true },
    });
    if (!marketplaceOrder) return;

    const provider = this.providerRegistry.get(marketplaceOrder.provider as MarketplaceProvider);
    if (input.status === 'confirmed' && provider.confirmOrder) {
      await provider.confirmOrder({
        connection: marketplaceOrder.connection,
        externalOrderId: marketplaceOrder.externalOrderId,
      });
    }
    if (input.status === 'cancelled' && provider.cancelOrder) {
      await provider.cancelOrder({
        connection: marketplaceOrder.connection,
        externalOrderId: marketplaceOrder.externalOrderId,
        reason: input.reason ?? undefined,
      });
    }

    await this.prisma.marketplaceOrder.update({
      where: { id: marketplaceOrder.id },
      data: {
        statusInternal: input.status,
        lastSyncedAt: new Date(),
      },
    });

    this.logger.log(`marketplace_status_sync_done provider=${marketplaceOrder.provider} orderId=${input.orderId} status=${input.status}`);
  }
}
