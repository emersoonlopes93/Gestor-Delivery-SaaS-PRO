import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

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
  private readonly accessToken: string;
  private readonly phoneNumberId: string;
  private readonly graphApiVersion: string;

  constructor(private readonly config: ConfigService) {
    this.accessToken = this.config.get<string>('WHATSAPP_CLOUD_ACCESS_TOKEN', '');
    this.phoneNumberId = this.config.get<string>('WHATSAPP_CLOUD_PHONE_NUMBER_ID', '');
    this.graphApiVersion = this.config.get<string>('WHATSAPP_CLOUD_GRAPH_API_VERSION', 'v19.0');
  }

  private get isConfigured(): boolean {
    return !!(this.accessToken && this.phoneNumberId);
  }

  private get baseUrl(): string {
    return `https://graph.facebook.com/${this.graphApiVersion}/${this.phoneNumberId}/messages`;
  }

  /**
   * Envia uma mensagem de texto simples via WhatsApp Cloud API.
   */
  async sendTextMessage(to: string, body: string): Promise<boolean> {
    if (!this.isConfigured) {
      this.logger.warn('WhatsApp Cloud API não configurada. Pulando envio.');
      return false;
    }

    try {
      await axios.post(
        this.baseUrl,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body },
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );

      this.logger.log(`WhatsApp message sent to ${to}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to send WhatsApp message to ${to}:`, error?.response?.data || error.message);
      return false;
    }
  }

  /**
   * Envia uma mensagem usando um Template aprovado pelo Meta.
   */
  async sendTemplateMessage(
    to: string,
    templateName: string,
    language = 'pt_BR',
    parameters: string[] = [],
  ): Promise<boolean> {
    if (!this.isConfigured) {
      this.logger.warn('WhatsApp Cloud API não configurada. Pulando envio de template.');
      return false;
    }

    const components: any[] = [];
    if (parameters.length > 0) {
      components.push({
        type: 'body',
        parameters: parameters.map((p) => ({ type: 'text', text: p })),
      });
    }

    try {
      await axios.post(
        this.baseUrl,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: templateName,
            language: { code: language },
            components,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        },
      );

      this.logger.log(`WhatsApp template "${templateName}" sent to ${to}`);
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to send WhatsApp template to ${to}:`, error?.response?.data || error.message);
      return false;
    }
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

    return this.sendTextMessage(customerPhone, message);
  }
}
