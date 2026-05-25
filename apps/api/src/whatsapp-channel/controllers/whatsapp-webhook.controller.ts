import {
  Controller,
  Post,
  Body,
  Headers,
  Logger,
  HttpCode,
  Param,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppProviderRegistryService } from '../services/whatsapp-provider-registry.service';
import type { WhatsAppWebhookEvent } from '../interfaces/whatsapp-provider.interface';
import { WhatsAppInstanceStatus } from '@prisma/client';
import { AiOrchestratorService } from '../../ai-agent/services/ai-orchestrator.service';


/**
 * Controller que recebe webhooks do Evolution Go.
 *
 * Eventos tratados:
 * - messages.upsert → nova mensagem recebida
 * - connection.update → mudança de status da conexão
 * - messages.update → atualização de status de entrega (ACK)
 *
 * Rota pública (sem auth guard) para receber callbacks.
 */
@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  private readonly logger = new Logger('WhatsAppWebhookController');

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistryService,
    @Inject(forwardRef(() => AiOrchestratorService))
    private readonly aiOrchestrator: AiOrchestratorService,
  ) {}

  /**
   * Webhook genérico do Evolution Go
   * O Evolution envia eventos com o campo "event" indicando o tipo
   */
  @Post(':tenantId')
  @HttpCode(200)
  async handleWebhook(
    @Param('tenantId') tenantId: string,
    @Body() body: unknown,
    @Headers('x-webhook-secret') _webhookSecret?: string,
  ) {
    this.logger.log(`Webhook received for tenant ${tenantId}`);

    try {
      // 1. Resolver o provider do tenant
      const provider = await this.providerRegistry.resolveProvider(tenantId);
      
      // 2. Tentar o parsing do evento
      const event = provider.parseWebhook(body, tenantId);
      if (!event) {
        this.logger.debug(`Unhandled event or invalid payload from ${provider.providerType}`);
        return { received: true, processed: false };
      }

      // 3. Processar baseado no tipo normalizado
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
      .catch(err => this.logger.error(`AI Orchestrator failed for ${phone}: ${err.message}`));
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
