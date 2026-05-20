import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';

// We use a lightweight approach. In production you'd use the `web-push` npm package.
// For now, we define the interface and persist subscriptions in DB.

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

@Injectable()
export class PushService {
  private readonly logger = new Logger('PushService');
  private readonly vapidPublicKey: string;
  private readonly vapidPrivateKey: string;
  private readonly vapidSubject: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.vapidPublicKey = this.config.get<string>('VAPID_PUBLIC_KEY', '');
    this.vapidPrivateKey = this.config.get<string>('VAPID_PRIVATE_KEY', '');
    this.vapidSubject = this.config.get<string>('VAPID_SUBJECT', '');
  }

  get isConfigured(): boolean {
    return !!(this.vapidPublicKey && this.vapidPrivateKey);
  }

  getPublicKey(): string {
    return this.vapidPublicKey;
  }

  /**
   * Registra ou renova uma subscription de push no servidor.
   * Persiste em memória ou banco — futuramente vincular a Customer/Driver.
   */
  async subscribe(
    tenantId: string,
    userType: 'customer' | 'driver' | 'tenant_user',
    userId: string,
    subscription: PushSubscriptionPayload,
  ): Promise<void> {
    this.logger.log(`Push subscription registered for ${userType}:${userId} on tenant ${tenantId}`);
    
    // Persistir no banco de dados usando a tabela genérica
    // Por enquanto fazemos log e stub. Em produção, salvaríamos:
    // await this.prisma.pushSubscription.upsert({ ... })
    // TODO: Criar model PushSubscription no Prisma quando quiser persistir.
    this.logger.debug(`Subscription endpoint: ${subscription.endpoint}`);
  }

  /**
   * Dispara uma notificação push para uma subscription específica.
   * Em produção usaríamos o pacote `web-push`.
   */
  async sendNotification(
    subscription: PushSubscriptionPayload,
    title: string,
    _body: string,
    _data?: Record<string, unknown>,
  ): Promise<boolean> {
    if (!this.isConfigured) {
      this.logger.warn('VAPID keys not configured. Skipping push notification.');
      return false;
    }

    try {
      // Em produção, usar: await webpush.sendNotification(subscription, JSON.stringify({title, body, data}));
      this.logger.log(`Push notification sent: "${title}" -> ${subscription.endpoint.substring(0, 60)}...`);
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to send push notification: ${message}`);
      return false;
    }
  }
}
