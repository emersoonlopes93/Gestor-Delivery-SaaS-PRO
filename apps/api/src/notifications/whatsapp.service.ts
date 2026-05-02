import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppSenderService } from '../whatsapp-channel/services/whatsapp-sender.service';
import { PrismaService } from '../database/prisma.service';

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
      return result.success;
    } catch (error: any) {
      this.logger.error(`Failed to send WhatsApp message to ${to}: ${error.message}`);
      return false;
    }
  }

  /**
   * Envia uma mensagem usando um Template (Apenas Meta Cloud).
   */
  async sendTemplateMessage(
    to: string,
    templateName: string,
    language = 'pt_BR',
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
    customerPhone: string,
    orderNumber: string,
    status: string,
    restaurantName: string,
  ): Promise<boolean> {
    const statusMessages: Record<string, string> = {
      confirmed: `✅ Pedido #${orderNumber} confirmado! ${restaurantName} já está preparando seu pedido.`,
      preparing: `👨‍🍳 Pedido #${orderNumber} está sendo preparado por ${restaurantName}. Já já sai!`,
      ready: `📦 Pedido #${orderNumber} está pronto! Aguardando retirada/entregador.`,
      out_for_delivery: `🛵 Pedido #${orderNumber} saiu para entrega! Fique atento.`,
      completed: `🎉 Pedido #${orderNumber} foi entregue! Bom apetite! Obrigado por pedir no ${restaurantName}.`,
      cancelled: `❌ Pedido #${orderNumber} foi cancelado. Entre em contato com ${restaurantName} para mais informações.`,
    };

    const message = statusMessages[status];
    if (!message) {
      this.logger.debug(`No WhatsApp message configured for status: ${status}`);
      return false;
    }

    // Busca o tenantId pelo nome do restaurante se não vier direto (idealmente deveria vir)
    const tenant = await this.prisma.tenant.findFirst({ where: { name: restaurantName }, select: { id: true } });

    return this.sendTextMessage(customerPhone, message, tenant?.id);
  }
}
