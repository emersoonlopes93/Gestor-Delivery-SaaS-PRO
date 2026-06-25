import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppSenderService } from '../whatsapp-channel/services/whatsapp-sender.service';
import { PrismaService } from '../database/prisma.service';
import { applyCampaignTemplate } from '../campaigns/utils/campaign-template.util';

export interface WhatsAppMessagePayload {
  to: string;        // Phone number in international format e.g. 5511999999999
  templateName?: string;
  templateLanguage?: string;
  templateParameters?: string[];
  textBody?: string;  // For plain-text messages (non-template)
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger('WhatsappService');

  constructor(
    private readonly whatsappSender: WhatsAppSenderService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Envia uma mensagem de texto simples.
   * Tenta encontrar o tenantId baseado no contexto (se possível) ou usa o padrão do sistema.
   */
  async sendTextMessage(to: string, body: string, tenantId?: string): Promise<boolean> {
    if (!tenantId) {
      this.logger.warn('tenantId não fornecido para envio de WhatsApp. Tentando resolver...');
      // Busca o primeiro tenant como fallback ou falha
      const tenant = await this.prisma.tenant.findFirst({ select: { id: true } });
      if (!tenant) return false;
      tenantId = tenant.id;
    }

    try {
      const result = await this.whatsappSender.sendText(tenantId, { to, text: body });
      
      if (result.success && result.messageId) {
        try {
          const cleanPhone = to.replace(/\D/g, '');
          const session = await this.prisma.chatSession.findFirst({
            where: { tenantId, remoteJid: { contains: cleanPhone } },
            select: { id: true }
          });

          if (session) {
            await this.prisma.$transaction(async (tx) => {
              const existingMsg = await tx.chatMessage.findUnique({
                where: { externalId: result.messageId },
              });

              if (existingMsg) {
                await tx.chatMessage.update({
                  where: { id: existingMsg.id },
                  data: { senderType: 'system' },
                });
                await tx.chatSession.update({
                  where: { id: session.id },
                  data: { 
                    handoffActive: false, 
                    handoffOperator: null, 
                    handoffReason: null, 
                    handoffUntil: null 
                  },
                });
                this.logger.log(`Race condition auto-healed for message ${result.messageId}`);
              } else {
                await tx.chatMessage.create({
                  data: {
                    sessionId: session.id,
                    direction: 'outbound',
                    senderType: 'system',
                    content: body,
                    messageType: 'text',
                    externalId: result.messageId,
                    externalStatus: 'sent',
                    timestamp: new Date(),
                  },
                });
              }
            });
          }
        } catch (dbError) {
          this.logger.error(`Error saving system message: ${dbError instanceof Error ? dbError.message : 'unknown'}`);
        }
      }

      return result.success;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to send WhatsApp message to ${to}: ${message}`);
      return false;
    }
  }

  /**
   * Envia uma mensagem usando um Template (Apenas Meta Cloud).
   */
  async sendTemplateMessage(
    to: string,
    templateName: string,
    _language = 'pt_BR',
    parameters: string[] = [],
    tenantId?: string,
  ): Promise<boolean> {
    // Por enquanto, simplificamos enviando texto se não for Meta
    const text = `Template: ${templateName} | Args: ${parameters.join(', ')}`;
    return this.sendTextMessage(to, text, tenantId);
  }

  /**
   * Envia notificação de status do pedido ao cliente.
   */
  async notifyOrderStatus(
    tenantId: string,
    customerPhone: string,
    orderNumber: string,
    status: string,
    restaurantName: string,
  ): Promise<boolean> {
    // Filtro P0: Apenas notificações cruciais para evitar spam
    if (!['confirmed', 'out_for_delivery', 'cancelled'].includes(status)) {
      return true;
    }

    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { whatsappNotificationsEnabled: true, notificationTemplates: true }
    });

    if (!settings?.whatsappNotificationsEnabled) {
      this.logger.debug(`Notifications disabled for tenant ${tenantId}`);
      return false;
    }

    const templates = (settings.notificationTemplates as Record<string, string>) || {};
    let message = templates[status];

    if (!message) {
      // Fallback para mensagens padrão
      const statusMessages: Record<string, string> = {
        confirmed: `✅ Pedido #{{orderNumber}} confirmado! {{restaurantName}} já está preparando seu pedido.`,
        preparing: `👨‍🍳 Pedido #{{orderNumber}} está sendo preparado por {{restaurantName}}. Já já sai!`,
        ready: `📦 Pedido #{{orderNumber}} está pronto! Aguardando retirada/entregador.`,
        out_for_delivery: `🛵 Pedido #{{orderNumber}} saiu para entrega! Fique atento.`,
        completed: `🎉 Pedido #{{orderNumber}} foi entregue! Bom apetite! Obrigado por pedir no {{restaurantName}}.`,
        cancelled: `❌ Pedido #{{orderNumber}} foi cancelado. Entre em contato com {{restaurantName}} para mais informações.`,
      };
      message = statusMessages[status];
    }

    if (!message) {
      this.logger.debug(`No WhatsApp message configured for status: ${status}`);
      return false;
    }

    const finalMessage = applyCampaignTemplate(message, {
      orderNumber,
      restaurantName,
    });

    return this.sendTextMessage(customerPhone, finalMessage, tenantId);
  }
}
