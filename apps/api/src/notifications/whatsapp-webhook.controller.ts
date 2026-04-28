import { Controller, Get, Post, Body, Query, Logger, HttpCode } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Webhook Controller para receber mensagens do WhatsApp Cloud API.
 * É responsável pela validação do token via GET e recepção de mensagens via POST.
 */
@Controller('webhooks/whatsapp')
export class WhatsappWebhookController {
  private readonly logger = new Logger('WhatsappWebhookController');
  private readonly verifyToken: string;

  constructor(private readonly config: ConfigService) {
    this.verifyToken = this.config.get<string>('WHATSAPP_WEBHOOK_VERIFY_TOKEN', '');
  }

  /**
   * GET - Verificação do Webhook (Meta envia isso na validação inicial).
   */
  @Get()
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    if (mode === 'subscribe' && token === this.verifyToken) {
      this.logger.log('WhatsApp webhook verified successfully');
      return challenge;
    }

    this.logger.warn('WhatsApp webhook verification failed');
    return 'Verification failed';
  }

  /**
   * POST - Recepção de mensagens em tempo real.
   * Fundação para chatbot ou respostas automáticas futuras.
   */
  @Post()
  @HttpCode(200)
  receiveMessage(@Body() body: any): { status: string } {
    this.logger.debug('WhatsApp webhook received:', JSON.stringify(body));

    // Extrair mensagem se existir
    const entry = body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (value?.messages?.[0]) {
      const message = value.messages[0];
      this.logger.log(
        `Incoming WhatsApp message from ${message.from}: ${message.text?.body || '[media]'}`,
      );
      
      // TODO: Implementar lógica de chatbot ou roteamento de mensagem aqui.
    }

    return { status: 'ok' };
  }
}
