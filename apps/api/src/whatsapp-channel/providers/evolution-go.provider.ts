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
 * Provider de WhatsApp via Evolution Go.
 * Baseado no Swagger real de https://go.kigula.dpdns.org/swagger/doc.json
 *
 * Endpoints utilizados:
 * - POST /instance/create
 * - POST /instance/connect
 * - POST /instance/disconnect
 * - GET  /instance/status
 * - GET  /instance/qr
 * - POST /send/text
 * - POST /send/media
 * - POST /send/list
 * - POST /send/button
 * - POST /message/markread
 */
@Injectable()
export class EvolutionGoProvider implements IWhatsAppProvider {
  private readonly logger = new Logger('EvolutionGoProvider');
  readonly providerType = 'evolution_go' as const;

  private buildClient(apiUrl: string, apiKey: string): AxiosInstance {
    return axios.create({
      baseURL: apiUrl.replace(/\/+$/, ''),
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      timeout: 30_000,
    });
  }

  async createInstance(
    apiUrl: string,
    apiKey: string,
    input: WhatsAppCreateInstanceInput,
  ): Promise<WhatsAppCreateInstanceResult> {
    const client = this.buildClient(apiUrl, apiKey);
    try {
      const { data } = await client.post('/instance/create', {
        name: input.instanceName,
        token: input.token || undefined,
      });

      this.logger.log(`Instance created: ${input.instanceName}`);
      return {
        instanceId: data?.instanceId || data?.id || input.instanceName,
        instanceName: data?.name || input.instanceName,
        token: data?.token,
      };
    } catch (error: any) {
      this.logger.error(`createInstance failed: ${error.message}`);
      throw error;
    }
  }

  async connect(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
    input: WhatsAppConnectInput,
  ): Promise<WhatsAppConnectionStatus> {
    const client = this.buildClient(apiUrl, apiKey);
    try {
      const { data } = await client.post('/instance/connect', {
        immediate: true,
        webhookUrl: input.webhookUrl,
        subscribe: input.subscribe || [
          'messages.upsert',
          'connection.update',
          'messages.update',
        ],
      });

      return this.parseConnectionStatus(data);
    } catch (error: any) {
      this.logger.error(`connect failed: ${error.message}`);
      throw error;
    }
  }

  async disconnect(
    apiUrl: string,
    apiKey: string,
    _instanceId: string,
  ): Promise<void> {
    const client = this.buildClient(apiUrl, apiKey);
    try {
      await client.post('/instance/disconnect');
      this.logger.log('Instance disconnected');
    } catch (error: any) {
      this.logger.error(`disconnect failed: ${error.message}`);
      throw error;
    }
  }

  async getConnectionStatus(
    apiUrl: string,
    apiKey: string,
    _instanceId: string,
  ): Promise<WhatsAppConnectionStatus> {
    const client = this.buildClient(apiUrl, apiKey);
    try {
      const { data } = await client.get('/instance/status');
      return this.parseConnectionStatus(data);
    } catch (error: any) {
      this.logger.error(`getConnectionStatus failed: ${error.message}`);
      return {
        connected: false,
        state: 'disconnected',
      };
    }
  }

  async getQrCode(
    apiUrl: string,
    apiKey: string,
    _instanceId: string,
  ): Promise<string | null> {
    const client = this.buildClient(apiUrl, apiKey);
    try {
      const { data } = await client.get('/instance/qr');
      return data?.qrCode || data?.qr || data?.base64 || null;
    } catch (error: any) {
      this.logger.warn(`getQrCode failed: ${error.message}`);
      return null;
    }
  }

  async sendText(
    apiUrl: string,
    apiKey: string,
    _instanceId: string,
    input: WhatsAppSendTextInput,
  ): Promise<WhatsAppSendResult> {
    const client = this.buildClient(apiUrl, apiKey);
    try {
      const body: Record<string, unknown> = {
        number: input.to,
        text: input.text,
      };
      if (input.delay) body.delay = input.delay;
      if (input.quotedMessageId) {
        body.quoted = { messageId: input.quotedMessageId };
      }

      const { data } = await client.post('/send/text', body);
      return {
        success: true,
        messageId: data?.messageId || data?.key?.id || data?.id,
      };
    } catch (error: any) {
      this.logger.error(`sendText failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async sendMedia(
    apiUrl: string,
    apiKey: string,
    _instanceId: string,
    input: WhatsAppSendMediaInput,
  ): Promise<WhatsAppSendResult> {
    const client = this.buildClient(apiUrl, apiKey);
    try {
      const body: Record<string, unknown> = {
        number: input.to,
        type: input.type,
        url: input.url,
      };
      if (input.caption) body.caption = input.caption;
      if (input.filename) body.filename = input.filename;
      if (input.delay) body.delay = input.delay;

      const { data } = await client.post('/send/media', body);
      return {
        success: true,
        messageId: data?.messageId || data?.key?.id || data?.id,
      };
    } catch (error: any) {
      this.logger.error(`sendMedia failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async sendList(
    apiUrl: string,
    apiKey: string,
    _instanceId: string,
    input: WhatsAppSendListInput,
  ): Promise<WhatsAppSendResult> {
    const client = this.buildClient(apiUrl, apiKey);
    try {
      const body = {
        number: input.to,
        title: input.title,
        description: input.description,
        footerText: input.footerText,
        buttonText: input.buttonText || 'Ver Menu',
        sections: input.sections,
        delay: input.delay,
      };

      const { data } = await client.post('/send/list', body);
      return {
        success: true,
        messageId: data?.messageId || data?.key?.id || data?.id,
      };
    } catch (error: any) {
      this.logger.error(`sendList failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async sendButtons(
    apiUrl: string,
    apiKey: string,
    _instanceId: string,
    input: WhatsAppSendButtonInput,
  ): Promise<WhatsAppSendResult> {
    const client = this.buildClient(apiUrl, apiKey);
    try {
      const body = {
        number: input.to,
        title: input.title,
        description: input.description,
        footer: input.footer,
        buttons: input.buttons.map((b) => ({
          type: b.type,
          id: b.id,
          displayText: b.displayText,
        })),
        delay: input.delay,
      };

      const { data } = await client.post('/send/button', body);
      return {
        success: true,
        messageId: data?.messageId || data?.key?.id || data?.id,
      };
    } catch (error: any) {
      this.logger.error(`sendButtons failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async markAsRead(
    apiUrl: string,
    apiKey: string,
    _instanceId: string,
    chatId: string,
    messageIds: string[],
  ): Promise<void> {
    const client = this.buildClient(apiUrl, apiKey);
    try {
      await client.post('/message/markread', {
        number: chatId,
        id: messageIds,
      });
    } catch (error: any) {
      this.logger.warn(`markAsRead failed: ${error.message}`);
    }
  }

  private parseConnectionStatus(data: any): WhatsAppConnectionStatus {
    if (!data) {
      return { connected: false, state: 'disconnected' };
    }

    const rawState = (
      data?.state || data?.status || data?.connectionStatus || ''
    ).toString().toLowerCase();

    let state: WhatsAppConnectionStatus['state'] = 'disconnected';
    if (rawState === 'open' || rawState === 'connected') {
      state = 'connected';
    } else if (rawState === 'connecting' || rawState === 'opening') {
      state = 'connecting';
    } else if (rawState === 'qr' || rawState === 'qr_pending') {
      state = 'qr_pending';
    }

    return {
      connected: state === 'connected',
      state,
      phoneNumber: data?.phoneNumber || data?.phone || data?.jid,
      qrCode: data?.qrCode || data?.qr || data?.base64,
    };
  }
}
