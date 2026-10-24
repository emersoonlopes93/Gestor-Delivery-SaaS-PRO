import { Controller, Post, Body, Req, UseGuards, Get, Delete, ForbiddenException, Query } from '@nestjs/common';
import { PushSubscriptionService } from './push-subscription.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';
import { JwtPayload } from '@gestor/types';
import { PushService } from './push.service';
import { Public } from '../common/decorators';

/**
 * Controller seguro para gerenciar subscriptions de Web Push.
 * Exige autenticação (JWT) para identificar driver ou staff de loja.
 */
@Controller('notifications/push')
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(
    private readonly pushSubService: PushSubscriptionService,
    private readonly pushService: PushService,
  ) {}

  /**
   * Retorna a chave VAPID pública para o frontend usar ao solicitar permissão.
   */
  @Public()
  @Get('vapid-key')
  getVapidKey() {
    return { publicKey: this.pushService.getPublicKey() };
  }

  /**
   * Registra uma subscription de push no servidor.
   */
  @Post('subscribe')
  async subscribe(@Body() body: SubscribePushDto, @Req() req: Request) {
    const user = req.user as JwtPayload;
    const { tenantId, recipientType, recipientId } = this.extractRecipientInfo(user);

    await this.pushSubService.subscribe(tenantId, recipientType, recipientId, body);
    return { success: true };
  }

  /**
   * Remove uma subscription específica.
   */
  @Delete('subscribe')
  async unsubscribe(@Query('endpoint') endpoint: string, @Req() req: Request) {
    const user = req.user as JwtPayload;
    const { tenantId, recipientType, recipientId } = this.extractRecipientInfo(user);

    if (!endpoint) {
      return { success: false, message: 'Endpoint is required' };
    }

    try {
      await this.pushSubService.unsubscribe(tenantId, recipientType, recipientId, endpoint);
      return { success: true };
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Unknown error';
      return { success: false, message: errorMessage };
    }
  }

  /**
   * Remove TODAS as subscriptions do usuário logado (ex: logout).
   */
  @Post('unsubscribe-all')
  async unsubscribeAll(@Req() req: Request) {
    const user = req.user as JwtPayload;
    const { tenantId, recipientType, recipientId } = this.extractRecipientInfo(user);

    await this.pushSubService.unsubscribeAll(tenantId, recipientType, recipientId);
    return { success: true };
  }

  private extractRecipientInfo(user: JwtPayload) {
    if (user.type !== 'tenant' && user.type !== 'driver') {
      throw new ForbiddenException('Only tenant users or drivers can subscribe to push notifications');
    }

    return {
      tenantId: user.tenantId,
      recipientType: user.type === 'tenant' ? 'tenant_user' : 'driver' as 'tenant_user' | 'driver',
      recipientId: user.sub,
    };
  }
}
