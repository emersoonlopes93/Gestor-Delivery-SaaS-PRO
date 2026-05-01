import {
  Controller,
  Post,
  Body,
  Headers,
  Logger,
  HttpCode,
  Param,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
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
    // Injetamos opcionalmente o orquestrador para evitar dependência circular pesada se não estiver importado no módulo
    // Mas no app real o módulo WhatsApp importará o módulo AI ou vice versa.
    // Vamos usar a injeção normal e garantir que os módulos se conheçam (ou via EventEmitter, que é mais limpo).
    // Para simplificar no MVP, injetamos direto se fornecido.
  ) {}

  /**
   * Webhook genérico do Evolution Go
   * O Evolution envia eventos com o campo "event" indicando o tipo
   */
  @Post(':tenantId')
  @HttpCode(200)
  async handleWebhook(
    @Param('tenantId') tenantId: string,
    @Body() body: any,
    @Headers('x-webhook-secret') webhookSecret?: string,
  ) {
    const eventType =
      body?.event || body?.data?.event || body?.type || 'unknown';

    this.logger.log(
      `Webhook received for tenant ${tenantId}: ${eventType}`,
    );

    try {
      // Verificar se existe instância para esse tenant
      const instance = await this.prisma.whatsAppInstance.findUnique({
        where: { tenantId },
      });

      if (!instance) {
        this.logger.warn(`No instance found for tenant ${tenantId}`);
        return { received: true, processed: false };
      }

      // Validar webhook secret se configurado
      if (instance.webhookSecret && webhookSecret !== instance.webhookSecret) {
        this.logger.warn(`Invalid webhook secret for tenant ${tenantId}`);
        return { received: true, processed: false };
      }

      switch (eventType) {
        case 'messages.upsert':
          await this.handleMessageUpsert(tenantId, body);
          break;

        case 'connection.update':
          await this.handleConnectionUpdate(tenantId, instance.id, body);
          break;

        case 'messages.update':
          await this.handleMessageUpdate(tenantId, body);
          break;

        default:
          this.logger.debug(
            `Unhandled event type: ${eventType} for tenant ${tenantId}`,
          );
      }

      return { received: true, processed: true };
    } catch (error: any) {
      this.logger.error(
        `Webhook processing failed: ${error.message}`,
        error.stack,
      );
      return { received: true, processed: false, error: error.message };
    }
  }

  /**
   * Processa mensagem recebida (messages.upsert)
   * Extrai informações e persiste no ChatMessage.
   * O processamento pelo Agente IA será feito no AiAgentModule via evento.
   */
  private async handleMessageUpsert(tenantId: string, body: any) {
    const messageData = body?.data || body;
    const remoteJid =
      messageData?.key?.remoteJid ||
      messageData?.remoteJid ||
      messageData?.from;

    if (!remoteJid) {
      this.logger.warn('Message without remoteJid');
      return;
    }

    // Extrair phone do JID (formato: 5582988898565@s.whatsapp.net)
    const phone = remoteJid.replace(/@.*$/, '');

    // Verificar se é mensagem de grupo (ignorar)
    if (remoteJid.includes('@g.us')) {
      return;
    }

    // Verificar se é mensagem enviada por nós (fromMe)
    const fromMe = messageData?.key?.fromMe || false;
    if (fromMe) return;

    // Extrair conteúdo da mensagem
    const content = this.extractMessageContent(messageData);
    if (!content) return;

    const externalId =
      messageData?.key?.id || messageData?.messageId || messageData?.id;

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
        // Se a sessão estava fechada, reabrir
        closedAt: null,
        state: undefined, // manter estado atual se não fechada
      },
    });

    // Persistir mensagem
    await this.prisma.chatMessage.create({
      data: {
        sessionId: session.id,
        direction: 'inbound',
        content,
        messageType: this.detectMessageType(messageData),
        externalId,
      },
    });

    this.logger.log(
      `Message stored for session ${session.id} from ${phone}`,
    );

    // TODO: Para evitar dependência circular forte, o ideal seria usar o EventEmitter2 (@nestjs/event-emitter)
    // Emitiríamos um evento como 'whatsapp.message.received' e o AiOrchestrator escutaria.
    // Como ainda não temos o EventEmitter configurado globalmente neste trecho, deixamos a marcação.
    // O AiOrchestratorService.handleInboundMessage(tenantId, phone, content) fará o processamento.
  }

  /**
   * Processa atualização de conexão
   */
  private async handleConnectionUpdate(
    tenantId: string,
    instanceId: string,
    body: any,
  ) {
    const data = body?.data || body;
    const state = (
      data?.state || data?.status || data?.connection || ''
    ).toString().toLowerCase();

    const statusMap: Record<string, any> = {
      open: 'connected',
      connected: 'connected',
      close: 'disconnected',
      disconnected: 'disconnected',
      connecting: 'connecting',
    };

    const newStatus = statusMap[state];
    if (newStatus) {
      await this.prisma.whatsAppInstance.update({
        where: { id: instanceId },
        data: {
          status: newStatus,
          phoneNumber: data?.phoneNumber || data?.phone || undefined,
        },
      });
      this.logger.log(`Connection status updated for tenant ${tenantId}: ${newStatus}`);
    }
  }

  /**
   * Processa atualização de status de mensagem (ACK)
   */
  private async handleMessageUpdate(tenantId: string, body: any) {
    const data = body?.data || body;
    const messageId = data?.key?.id || data?.messageId || data?.id;
    const status = data?.update?.status || data?.status;

    if (!messageId) return;

    // Atualizar metadata da mensagem se necessário
    // Útil para campanhas: atualizar status de entrega
    this.logger.debug(
      `Message update for tenant ${tenantId}: ${messageId} -> ${status}`,
    );
  }

  /**
   * Extrai o conteúdo textual da mensagem do payload do Evolution Go
   */
  private extractMessageContent(data: any): string | null {
    // Texto simples
    if (data?.message?.conversation) return data.message.conversation;

    // Texto expandido
    if (data?.message?.extendedTextMessage?.text) {
      return data.message.extendedTextMessage.text;
    }

    // Caption de mídia
    if (data?.message?.imageMessage?.caption) {
      return data.message.imageMessage.caption;
    }
    if (data?.message?.videoMessage?.caption) {
      return data.message.videoMessage.caption;
    }
    if (data?.message?.documentMessage?.caption) {
      return data.message.documentMessage.caption;
    }

    // Resposta de botão
    if (data?.message?.buttonsResponseMessage?.selectedButtonId) {
      return data.message.buttonsResponseMessage.selectedButtonId;
    }

    // Resposta de lista
    if (data?.message?.listResponseMessage?.singleSelectReply?.selectedRowId) {
      return data.message.listResponseMessage.singleSelectReply.selectedRowId;
    }

    // Reação (ignorar)
    if (data?.message?.reactionMessage) return null;

    // Fallback: tentar body ou text
    return data?.body || data?.text || null;
  }

  /**
   * Detecta o tipo de mensagem recebida
   */
  private detectMessageType(data: any): string {
    if (data?.message?.imageMessage) return 'image';
    if (data?.message?.videoMessage) return 'video';
    if (data?.message?.audioMessage) return 'audio';
    if (data?.message?.documentMessage) return 'document';
    if (data?.message?.locationMessage) return 'location';
    if (data?.message?.contactMessage) return 'contact';
    if (data?.message?.stickerMessage) return 'sticker';
    if (data?.message?.buttonsResponseMessage) return 'button_response';
    if (data?.message?.listResponseMessage) return 'list_response';
    return 'text';
  }
}
