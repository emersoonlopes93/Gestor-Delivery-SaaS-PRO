import {
  Controller,
  Post,
  Body,
  Headers,
  Logger,
  HttpCode,
  Inject,
  forwardRef,
  Query,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppProviderRegistryService } from '../services/whatsapp-provider-registry.service';
import type { WhatsAppWebhookEvent } from '../interfaces/whatsapp-provider.interface';
import { WhatsAppInstanceStatus } from '@prisma/client';
import { AiOrchestratorService } from '../../ai-agent/services/ai-orchestrator.service';


/**
 * Controller que recebe webhooks do Evolution Go.
 *
 * Rota pública (sem auth guard) para receber callbacks.
 * A URL configurada na Evolution Go deve ser:
 * {PUBLIC_API_URL}/api/v1/whatsapp/evolution/webhook?secret={SECRET}
 */
@Controller('whatsapp/evolution')
export class WhatsAppWebhookController {
  private readonly logger = new Logger('WhatsAppWebhookController');

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistryService,
    @Inject(forwardRef(() => AiOrchestratorService))
    private readonly aiOrchestrator: AiOrchestratorService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Body() body: unknown,
    @Headers('x-webhook-secret') webhookSecretHeader?: string,
    @Query('secret') webhookSecretQuery?: string,
  ) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      this.logger.warn('Webhook received with invalid body');
      return { received: true, processed: false, error: 'Invalid body' };
    }

    const payload = body as Record<string, unknown>;

    // Log básico para diagnóstico
    const eventName =
      (typeof payload.event === 'string' && payload.event) ||
      (typeof payload.type === 'string' && payload.type) ||
      '';
    const instanceNameFromPayload =
      (typeof payload.instance === 'string' && payload.instance) ||
      (typeof payload.instanceName === 'string' && payload.instanceName) ||
      '';
    const instanceIdFromPayload = typeof payload.instanceId === 'string' ? payload.instanceId : '';
    
    this.logger.log(
      `Webhook received. Event: ${eventName || 'unknown'}, Instance: ${instanceNameFromPayload || instanceIdFromPayload || 'unknown'}`,
    );

    // Evolution-Go envia o instanceId e instanceToken no root do payload
    const instanceId = instanceIdFromPayload;
    
    if (!instanceId) {
      // Tentar fallback por instance name se existir (compatibilidade)
      const instanceName = instanceNameFromPayload;
      if (!instanceName) {
        this.logger.warn('Webhook received without instance identifier (instanceId or instance name)');
        return { received: true, processed: false, error: 'Instance identifier missing' };
      }
      return this.processByInstanceName(instanceName, payload, webhookSecretHeader, webhookSecretQuery);
    }

    try {
      // 1. Resolver a instância pelo instanceId (UUID do Evolution-Go)
      const instance = await this.prisma.whatsAppInstance.findFirst({
        where: { evolutionInstanceId: instanceId },
      });

      if (!instance) {
        this.logger.warn(`No instance found for evolutionInstanceId: ${instanceId}`);
        return { received: true, processed: false, error: 'Instance not found' };
      }

      const tenantId = instance.tenantId;

      // Validar secret
      const providedSecret = webhookSecretHeader || webhookSecretQuery;
      if (instance.webhookSecret && instance.webhookSecret !== providedSecret) {
        this.logger.warn(`Invalid webhook secret for tenant ${tenantId}`);
        return { received: true, processed: false, error: 'Invalid secret' };
      }

      // 2. Resolver o provider
      const provider = this.providerRegistry.getProvider(instance.providerType);
      
      // 3. Tentar o parsing do evento (ajustado para Evolution-Go)
      const event = provider.parseWebhook(payload, tenantId);
      if (!event) {
        this.logger.debug(`Event ignored or not parsed: ${eventName}`);
        return { received: true, processed: false };
      }

      // 4. Processar baseado no tipo normalizado
      switch (event.type) {
        case 'message':
          await this.handleNormalizedMessage(event);
          break;
        case 'connection':
          await this.handleNormalizedConnection(event);
          break;
        case 'ack':
          await this.handleNormalizedAck(event);
          break;
      }

      return { received: true, processed: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Webhook processing failed: ${message}`);
      return { received: true, processed: false, error: message };
    }
  }

  private async processByInstanceName(
    instanceName: string,
    payload: Record<string, unknown>,
    headerSecret?: string,
    querySecret?: string,
  ) {
    const instance = await this.prisma.whatsAppInstance.findFirst({
      where: { 
        OR: [
          { instanceName: instanceName },
          { evolutionInstanceId: instanceName }
        ]
      },
    });

    if (!instance) {
      this.logger.warn(`No instance found for instance name: ${instanceName}`);
      return { received: true, processed: false, error: 'Instance not found' };
    }

    const providedSecret = headerSecret || querySecret;
    if (instance.webhookSecret && instance.webhookSecret !== providedSecret) {
      this.logger.warn(`Invalid webhook secret for instance name: ${instanceName}`);
      return { received: true, processed: false, error: 'Invalid secret' };
    }

    const provider = this.providerRegistry.getProvider(instance.providerType);
    const event = provider.parseWebhook(payload, instance.tenantId);
    if (!event) return { received: true, processed: false };

    switch (event.type) {
      case 'message': await this.handleNormalizedMessage(event); break;
      case 'connection': await this.handleNormalizedConnection(event); break;
      case 'ack': await this.handleNormalizedAck(event); break;
    }
    return { received: true, processed: true };
  }

  private async handleNormalizedMessage(event: WhatsAppWebhookEvent) {
    const { tenantId, from: phone, content, messageType, externalId } = event;
    if (!phone || !content) return;

    // Verificar se já processamos essa mensagem
    if (externalId) {
      const existing = await this.prisma.chatMessage.findUnique({
        where: { externalId },
      });
      if (existing) return;
    }

    // Encontrar ou criar sessão
    const session = await this.prisma.chatSession.upsert({
      where: {
        tenantId_customerPhone: { tenantId, customerPhone: phone },
      },
      create: {
        tenantId,
        customerPhone: phone,
        state: 'greeting',
        lastMessageAt: new Date(),
      },
      update: {
        lastMessageAt: new Date(),
        closedAt: null,
      },
    });

    // Persistir mensagem
    await this.prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        direction: 'inbound',
        content,
        messageType: messageType || 'text',
        externalId,
      },
    });

    this.logger.log(`Message stored for session ${session.id} from ${phone}`);
    
    // Disparar o orquestrador de IA de forma assíncrona (não bloqueia o webhook)
    this.aiOrchestrator.handleInboundMessage(tenantId, phone, content)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(`AI Orchestrator failed for ${phone}: ${msg}`);
      });
  }

  private async handleNormalizedConnection(event: WhatsAppWebhookEvent) {
    const { tenantId, state, phoneNumber } = event;
    if (!state) return;

    const instance = await this.prisma.whatsAppInstance.findUnique({
      where: { tenantId },
    });

    if (instance) {
      await this.prisma.whatsAppInstance.update({
        where: { id: instance.id },
        data: {
          status: state as WhatsAppInstanceStatus,
          phoneNumber: phoneNumber || instance.phoneNumber,
        },
      });
      this.logger.log(`Connection updated for ${tenantId}: ${state}`);
    }
  }

  private async handleNormalizedAck(event: WhatsAppWebhookEvent) {
    this.logger.debug(`ACK received for ${event.externalId}: ${event.status}`);
  }
}
