import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';
import { PushSubscription } from '@prisma/client';

@Injectable()
export class PushSubscriptionService {
  private readonly logger = new Logger(PushSubscriptionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async subscribe(
    tenantId: string,
    recipientType: 'driver' | 'tenant_user',
    recipientId: string,
    dto: SubscribePushDto,
  ): Promise<PushSubscription> {
    const { endpoint, keys, userAgent } = dto;

    this.logger.log(`Subscribing ${recipientType} ${recipientId} to push notifications...`);

    const subscription = await this.prisma.pushSubscription.upsert({
      where: {
        tenantId_recipientId_recipientType_endpoint: {
          tenantId,
          recipientId,
          recipientType,
          endpoint,
        },
      },
      create: {
        tenantId,
        recipientType,
        recipientId,
        endpoint,
        p256dhKey: keys.p256dh,
        authKey: keys.auth,
        userAgent,
        isActive: true,
      },
      update: {
        p256dhKey: keys.p256dh,
        authKey: keys.auth,
        userAgent,
        isActive: true,
        updatedAt: new Date(),
      },
    });

    return subscription;
  }

  async unsubscribe(tenantId: string, recipientType: 'driver' | 'tenant_user', recipientId: string, endpoint: string): Promise<void> {
    this.logger.log(`Unsubscribing ${recipientType} ${recipientId} from push notifications...`);

    const subscription = await this.prisma.pushSubscription.findUnique({
      where: {
        tenantId_recipientId_recipientType_endpoint: {
          tenantId,
          recipientId,
          recipientType,
          endpoint,
        },
      },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    await this.prisma.pushSubscription.delete({
      where: { id: subscription.id },
    });
  }

  async deactivateSubscription(id: string): Promise<void> {
    await this.prisma.pushSubscription.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async deleteSubscription(id: string): Promise<void> {
    await this.prisma.pushSubscription.delete({
      where: { id },
    });
  }

  async unsubscribeAll(tenantId: string, recipientType: 'driver' | 'tenant_user', recipientId: string): Promise<void> {
    this.logger.log(`Unsubscribing ALL endpoints for ${recipientType} ${recipientId}...`);
    await this.prisma.pushSubscription.deleteMany({
      where: {
        tenantId,
        recipientType,
        recipientId,
      },
    });
  }
}
