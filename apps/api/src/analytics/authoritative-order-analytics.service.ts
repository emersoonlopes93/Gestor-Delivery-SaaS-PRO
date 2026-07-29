import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { OrderStatus, Prisma } from '@prisma/client';

type AuthoritativeEventName = 'order_confirmed' | 'order_completed' | 'order_cancelled';

interface RecordOrderEventInput {
  tenantId: string;
  orderId: string;
  orderStatus: OrderStatus;
  orderTotal: Prisma.Decimal | number;
  occurredAt: Date;
  tx: Prisma.TransactionClient;
}

@Injectable()
export class AuthoritativeOrderAnalyticsService {
  async recordOrderStatusEvent(input: RecordOrderEventInput): Promise<void> {
    const eventName = this.eventNameForStatus(input.orderStatus);
    if (!eventName) return;

    await input.tx.analyticsEvent.createMany({
      data: {
        tenantId: input.tenantId,
        eventId: this.eventId(input.tenantId, input.orderId, eventName),
        schemaVersion: 1,
        eventName,
        source: 'server',
        occurredAt: input.occurredAt,
        receivedAt: input.occurredAt,
        sessionId: `server_${input.orderId}`,
        orderId: input.orderId,
        value: input.orderTotal,
        currency: 'BRL',
        consentAnalytics: true,
        consentMarketing: false,
      },
      skipDuplicates: true,
    });
  }

  private eventNameForStatus(status: OrderStatus): AuthoritativeEventName | null {
    if (status === OrderStatus.confirmed) return 'order_confirmed';
    if (status === OrderStatus.completed) return 'order_completed';
    if (status === OrderStatus.cancelled) return 'order_cancelled';
    return null;
  }

  private eventId(tenantId: string, orderId: string, eventName: AuthoritativeEventName): string {
    const digest = createHash('sha256')
      .update(`${tenantId}:${orderId}:${eventName}`)
      .digest('hex')
      .slice(0, 32)
      .split('');
    digest[12] = '5';
    digest[16] = ((Number.parseInt(digest[16], 16) & 0x3) | 0x8).toString(16);
    return `${digest.slice(0, 8).join('')}-${digest.slice(8, 12).join('')}-${digest.slice(12, 16).join('')}-${digest.slice(16, 20).join('')}-${digest.slice(20).join('')}`;
  }
}
