import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import type {
  IWhatsAppProvider,
  WhatsAppConnectionStatus,
  WhatsAppCreateInstanceInput,
  WhatsAppCreateInstanceResult,
  WhatsAppConnectInput,
  WhatsAppSendTextInput,
  WhatsAppSendMediaInput,
  WhatsAppSendListInput,
  WhatsAppSendButtonInput,
  WhatsAppSendResult,
} from '../interfaces/whatsapp-provider.interface';

/**
 * Provider de WhatsApp via Meta Cloud API (Graph API).
 * Mantido para retrocompatibilidade. Desativado por padrão.
 *
 * Usa as variáveis de ambiente:
 * - WHATSAPP_CLOUD_ACCESS_TOKEN
 * - WHATSAPP_CLOUD_PHONE_NUMBER_ID
 * - WHATSAPP_CLOUD_GRAPH_API_VERSION
 */
@Injectable()
export class MetaCloudProvider implements IWhatsAppProvider {
  private readonly logger = new Logger('MetaCloudProvider');
  readonly providerType = 'meta_cloud' as const;

  private buildClient(apiUrl: string, apiKey: string): AxiosInstance {
    const version = process.env.WHATSAPP_CLOUD_GRAPH_API_VERSION || 'v19.0';
    return axios.create({
      baseURL: `https://graph.facebook.com/${version}`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 30_000,
    });
  }

  async createInstance(
    _apiUrl: string,
    _apiKey: string,
    input: WhatsAppCreateInstanceInput,
  ): Promise<WhatsAppCreateInstanceResult> {
    // Meta Cloud API não tem conceito de "instância" dinâmica
    // Cada número é configurado no Meta Business Manager
    return {
      instanceId: input.instanceName,
      instanceName: input.instanceName,
    };
  }

  async connect(
    _apiUrl: string,
    _apiKey: string,
    _instanceId: string,
    _input: WhatsAppConnectInput,
  ): Promise<WhatsAppConnectionStatus> {
    // Meta Cloud está sempre "conectado" se o token é válido
    return { connected: true, state: 'connected' };
  }

  async disconnect(
    _apiUrl: string,
    _apiKey: string,
    _instanceId: string,
  ): Promise<void> {
    // No-op para Meta Cloud
  }

  async getConnectionStatus(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
  ): Promise<WhatsAppConnectionStatus> {
    const client = this.buildClient(apiUrl, apiKey);
    try {
      const phoneNumberId = instanceId || process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;
      await client.get(`/${phoneNumberId}`);
      return { connected: true, state: 'connected', phoneNumber: phoneNumberId };
    } catch {
      return { connected: false, state: 'disconnected' };
    }
  }

  async getQrCode(): Promise<string | null> {
    // Meta Cloud não usa QR Code
    return null;
  }

  async generatePairingCode(
    _apiUrl: string,
    _apiKey: string,
    _instanceId: string,
    _phone?: string,
  ): Promise<{ pairingCode: string }> {
    throw new Error('Pairing code não é suportado no provider Meta Cloud.');
  }

  async sendText(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
    input: WhatsAppSendTextInput,
  ): Promise<WhatsAppSendResult> {
    const client = this.buildClient(apiUrl, apiKey);
    const phoneNumberId = instanceId || process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;
    try {
      const { data } = await client.post(`/${phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        to: input.to,
        type: 'text',
        text: { body: input.text },
      });
      return {
        success: true,
        messageId: data?.messages?.[0]?.id,
      };
    } catch (error: any) {
      this.logger.error(`sendText failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async sendMedia(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
    input: WhatsAppSendMediaInput,
  ): Promise<WhatsAppSendResult> {
    const client = this.buildClient(apiUrl, apiKey);
    const phoneNumberId = instanceId || process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;
    try {
      const mediaPayload: Record<string, unknown> = { link: input.url };
      if (input.caption) mediaPayload.caption = input.caption;
      if (input.filename) mediaPayload.filename = input.filename;

      const { data } = await client.post(`/${phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        to: input.to,
        type: input.type,
        [input.type]: mediaPayload,
      });
      return {
        success: true,
        messageId: data?.messages?.[0]?.id,
      };
    } catch (error: any) {
      this.logger.error(`sendMedia failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async sendList(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
    input: WhatsAppSendListInput,
  ): Promise<WhatsAppSendResult> {
    const client = this.buildClient(apiUrl, apiKey);
    const phoneNumberId = instanceId || process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;
    try {
      const { data } = await client.post(`/${phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        to: input.to,
        type: 'interactive',
        interactive: {
          type: 'list',
          header: { type: 'text', text: input.title },
          body: { text: input.description },
          footer: { text: input.footerText },
          action: {
            button: input.buttonText,
            sections: input.sections.map((s) => ({
              title: s.title,
              rows: s.rows.map((r) => ({
                id: r.rowId,
                title: r.title,
                description: r.description || '',
              })),
            })),
          },
        },
      });
      return {
        success: true,
        messageId: data?.messages?.[0]?.id,
      };
    } catch (error: any) {
      this.logger.error(`sendList failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async sendButtons(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
    input: WhatsAppSendButtonInput,
  ): Promise<WhatsAppSendResult> {
    const client = this.buildClient(apiUrl, apiKey);
    const phoneNumberId = instanceId || process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;
    try {
      const { data } = await client.post(`/${phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        to: input.to,
        type: 'interactive',
        interactive: {
          type: 'button',
          header: { type: 'text', text: input.title },
          body: { text: input.description },
          footer: { text: input.footer },
          action: {
            buttons: input.buttons.map((b) => ({
              type: 'reply',
              reply: { id: b.id, title: b.displayText },
            })),
          },
        },
      });
      return {
        success: true,
        messageId: data?.messages?.[0]?.id,
      };
    } catch (error: any) {
      this.logger.error(`sendButtons failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async markAsRead(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
    _chatId: string,
    messageIds: string[],
  ): Promise<void> {
    const client = this.buildClient(apiUrl, apiKey);
    const phoneNumberId = instanceId || process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID;
    for (const msgId of messageIds) {
      try {
        await client.post(`/${phoneNumberId}/messages`, {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: msgId,
        });
      } catch (error: any) {
        this.logger.warn(`markAsRead failed for ${msgId}: ${error.message}`);
      }
    }
  }

  parseWebhook(payload: any, tenantId: string): any {
    // Meta Cloud API Webhook structure: { object: 'whatsapp_business_account', entry: [ { changes: [ { value: { ... } } ] } ] }
    if (payload?.object !== 'whatsapp_business_account') return null;

    const entry = payload.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value) return null;

    // Mensagens recebidas
    if (value.messages?.[0]) {
      const msg = value.messages[0];
      
      let content = '';
      if (msg.type === 'text') content = msg.text?.body;
      else if (msg.type === 'interactive') {
        if (msg.interactive?.type === 'button_reply') content = msg.interactive.button_reply.id;
        else if (msg.interactive?.type === 'list_reply') content = msg.interactive.list_reply.id;
      }
      
      if (!content) return null;

      return {
        type: 'message',
        tenantId,
        from: msg.from,
        content,
        messageType: msg.type,
        externalId: msg.id,
        raw: payload
      };
    }

    // Status de mensagens (ACK)
    if (value.statuses?.[0]) {
      const status = value.statuses[0];
      return {
        type: 'ack',
        tenantId,
        externalId: status.id,
        status: status.status,
        raw: payload
      };
    }

    return null;
  }
}
