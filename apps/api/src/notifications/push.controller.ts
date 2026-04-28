import { Controller, Get, Post, Body } from '@nestjs/common';
import { PushService, PushSubscriptionPayload } from './push.service';


/**
 * Controller público para gerenciar subscriptions de Web Push.
 * Não exige autenticação obrigatória (os clients do storefront/delivery se registram livremente).
 */
@Controller('notifications/push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  /**
   * Retorna a chave VAPID pública para o frontend usar ao solicitar permissão.
   */
  @Get('vapid-key')
  getVapidKey() {
    return { publicKey: this.pushService.getPublicKey() };
  }

  /**
   * Registra uma subscription de push no servidor.
   */
  @Post('subscribe')
  async subscribe(
    @Body()
    body: {
      tenantId: string;
      userType: 'customer' | 'driver' | 'tenant_user';
      userId: string;
      subscription: PushSubscriptionPayload;
    },
  ) {
    await this.pushService.subscribe(
      body.tenantId,
      body.userType,
      body.userId,
      body.subscription,
    );
    return { success: true };
  }
}
