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
  WhatsAppWebhookEvent,
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
      // Garantir que temos um token
      const token = input.token || Math.random().toString(36).substring(7);

      const { data } = await client.post('/instance/create', {
        name: input.instanceName,
        token: token,
      });

      const responseData = (data && typeof data === 'object' && 'data' in data) 
        ? (data as { data: Record<string, unknown> }).data 
        : (data as Record<string, unknown>);

      this.logger.log(`Instance created: ${input.instanceName}`);
      return {
        instanceId: String(responseData?.instanceId || responseData?.id || input.instanceName),
        instanceName: String(responseData?.name || input.instanceName),
        token: String(responseData?.token || token),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`createInstance failed: ${message}`);
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
      this.logger.debug(`Connecting instance ${instanceId} with webhook: ${input.webhookUrl}`);
      
      try {
        const qrResponse = await client.get('/instance/qr');
        const data = qrResponse.data as Record<string, unknown>;
        const qrData = (data?.data || data) as Record<string, unknown>;
        const qrCode = (qrData?.qrCode || qrData?.qr || qrData?.base64 || qrData?.Qrcode) as string | undefined;
        
        if (qrCode) {
          return {
            connected: false,
            state: 'qr_pending',
            qrCode: qrCode,
          };
        }
      } catch (qrError: unknown) {
        const message = qrError instanceof Error ? qrError.message : 'Unknown error';
        this.logger.warn(`Failed to get QR code first: ${message}`);
      }

      const requestBody = {
        webhookUrl: input.webhookUrl,
        subscribe: input.subscribe || [
          'messages.upsert',
          'connection.update',
          'messages.update',
        ],
      };

      const { data } = await client.post('/instance/connect', requestBody);
      const dataRec = data as Record<string, unknown>;
      return this.parseConnectionStatus((dataRec?.data || dataRec) as Record<string, unknown>);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`connect failed: ${message}`);
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`disconnect failed: ${message}`);
      throw error;
    }
  }

  async generatePairingCode(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
    phone?: string,
  ): Promise<{ pairingCode: string }> {
    const client = this.buildClient(apiUrl, apiKey);
    try {
      this.logger.log(`Generating pairing code for instance: ${instanceId}, phone: ${phone}`);
      
      const cleanPhone = phone?.replace(/\D/g, '');
      if (!cleanPhone) {
        throw new Error('Número de telefone é obrigatório para gerar o código de pareamento.');
      }

      const requestBody = {
        instanceName: instanceId,
        phone: cleanPhone
      };

      const { data } = await client.post('/instance/pair', requestBody);
      const dataRec = data as Record<string, unknown>;
      const responseData = (dataRec?.data || dataRec) as Record<string, unknown>;
      
      const pairingCode = 
        responseData?.PairingCode || 
        responseData?.pairingCode || 
        responseData?.code || 
        responseData?.pairing_code;

      return { pairingCode: String(pairingCode) };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`generatePairingCode failed: ${message}`);
      throw error;
    }
  }

  async getConnectionStatus(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
  ): Promise<WhatsAppConnectionStatus> {
    const client = this.buildClient(apiUrl, apiKey);
    try {
      console.log(`[Evolution Go] Getting status for instance ${instanceId}`);
      const { data } = await client.get('/instance/status');
      console.log(`[Evolution Go] Status response:`, data);
      const parsed = this.parseConnectionStatus(data?.data || data);
      console.log(`[Evolution Go] Parsed status:`, parsed);

      // Se conectado e não tem telefone, não vamos tentar obter (endpoints não funcionam)
      // O Evolution Go não expõe o número facilmente, então vamos deixar sem telefone

      return parsed;
    } catch (error) {
      const err = error as any;
      this.logger.error(`getConnectionStatus failed: ${err.message}`);
      console.error(`[Evolution Go] Status error:`, err.response?.data || err.message);
      return {
        connected: false,
        state: 'disconnected',
      };
    }
  }

  async getQrCode(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
  ): Promise<string | null> {
    const client = this.buildClient(apiUrl, apiKey);
    try {
      console.log(`[Evolution Go] Getting QR code for instance ${instanceId}`);
      const { data } = await client.get('/instance/qr');
      console.log(`[Evolution Go] QR response:`, data);
      const responseData = (data as any)?.data || data;
      const qrCode = responseData?.qrCode || responseData?.qr || responseData?.base64 || responseData?.Qrcode || null;
      console.log(`[Evolution Go] Extracted QR code:`, qrCode ? '***FOUND***' : 'NOT FOUND');
      return qrCode;
    } catch (error) {
      const err = error as any;
      this.logger.warn(`getQrCode failed: ${err.message}`);
      console.error(`[Evolution Go] QR error:`, err.response?.data || err.message);
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
      const responseData = (data && typeof data === 'object' && 'data' in data) 
        ? (data as { data: Record<string, unknown> }).data 
        : (data as Record<string, unknown>);
      
      return {
        success: true,
        messageId: String(responseData?.messageId || (responseData?.key as Record<string, unknown>)?.id || responseData?.id),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`sendText failed: ${message}`);
      return { success: false, error: message };
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
      const dataRec = data as Record<string, unknown>;
      const responseData = (dataRec?.data || dataRec) as Record<string, unknown>;
      
      return {
        success: true,
        messageId: String(responseData?.messageId || (responseData?.key as Record<string, unknown>)?.id || responseData?.id),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`sendMedia failed: ${message}`);
      return { success: false, error: message };
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
      const dataRec = data as Record<string, unknown>;
      const responseData = (dataRec?.data || dataRec) as Record<string, unknown>;

      return {
        success: true,
        messageId: String(responseData?.messageId || (responseData?.key as Record<string, unknown>)?.id || responseData?.id),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`sendList failed: ${message}`);
      return { success: false, error: message };
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
      const dataRec = data as Record<string, unknown>;
      const responseData = (dataRec?.data || dataRec) as Record<string, unknown>;

      return {
        success: true,
        messageId: String(responseData?.messageId || (responseData?.key as Record<string, unknown>)?.id || responseData?.id),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`sendButtons failed: ${message}`);
      return { success: false, error: message };
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`markAsRead failed: ${message}`);
    }
  }

  parseWebhook(payload: Record<string, unknown>, tenantId: string): WhatsAppWebhookEvent | null {
    const eventType = (payload?.event || (payload?.data as Record<string, unknown>)?.event || payload?.type || 'unknown') as string;
    
    if (eventType === 'messages.upsert') {
      const data = (payload?.data || payload) as Record<string, unknown>;
      const key = data?.key as Record<string, unknown> | undefined;
      const remoteJid = (key?.remoteJid || data?.remoteJid || data?.from) as string | undefined;
      
      if (!remoteJid || remoteJid.includes('@g.us')) return null;
      if (key?.fromMe) return null;

      const content = this.extractMessageContent(data);
      if (!content) return null;

      return {
        type: 'message',
        tenantId,
        from: remoteJid.replace(/@.*$/, ''),
        content,
        messageType: this.detectMessageType(data),
        externalId: String(key?.id || data?.messageId || data?.id),
        raw: payload
      };
    }

    if (eventType === 'connection.update') {
      const data = (payload?.data || payload) as Record<string, unknown>;
      const status = this.parseConnectionStatus(data);
      return {
        type: 'connection',
        tenantId,
        state: status.state,
        phoneNumber: status.phoneNumber,
        raw: payload
      };
    }

    if (eventType === 'messages.update') {
      const data = (payload?.data || payload) as Record<string, unknown>;
      const update = data?.update as Record<string, unknown> | undefined;
      const key = data?.key as Record<string, unknown> | undefined;

      return {
        type: 'ack',
        tenantId,
        externalId: String(key?.id || data?.messageId || data?.id),
        status: String(update?.status || data?.status),
        raw: payload
      };
    }

    return null;
  }


  private extractMessageContent(data: Record<string, unknown>): string | null {
    const message = (data?.message || data) as Record<string, unknown>;
    if (typeof message === 'string') return message;
    if (message?.conversation) return String(message.conversation);
    if ((message?.extendedTextMessage as Record<string, unknown>)?.text) return String((message.extendedTextMessage as Record<string, unknown>).text);
    if ((message?.imageMessage as Record<string, unknown>)?.caption) return String((message.imageMessage as Record<string, unknown>).caption);
    if ((message?.videoMessage as Record<string, unknown>)?.caption) return String((message.videoMessage as Record<string, unknown>).caption);
    if ((message?.buttonsResponseMessage as Record<string, unknown>)?.selectedDisplayText) return String((message.buttonsResponseMessage as Record<string, unknown>).selectedDisplayText);
    if ((message?.listResponseMessage as Record<string, unknown>)?.title) return String((message.listResponseMessage as Record<string, unknown>).title);
    return null;
  }

  private detectMessageType(data: Record<string, unknown>): string {
    const message = (data?.message || data) as Record<string, unknown>;
    if (message?.imageMessage) return 'image';
    if (message?.videoMessage) return 'video';
    if (message?.audioMessage) return 'audio';
    if (message?.documentMessage) return 'document';
    if (message?.stickerMessage) return 'sticker';
    if (message?.locationMessage) return 'location';
    if (message?.contactMessage) return 'contact';
    return 'text';
  }

  private parseConnectionStatus(data: Record<string, unknown>): WhatsAppConnectionStatus {
    if (!data) {
      return { connected: false, state: 'disconnected' };
    }

    console.log(`[Evolution Go] Parsing status from:`, data);

    const rawState = (
      String(data?.state || data?.status || data?.connectionStatus || '')
    ).toLowerCase();

    let state: WhatsAppConnectionStatus['state'] = 'disconnected';
    
    // Verificar Connected: true e LoggedIn: true = conectado
    if (data?.Connected === true && data?.LoggedIn === true) {
      state = 'connected';
    } else if (rawState === 'open' || rawState === 'connected') {
      state = 'connected';
    } else if (rawState === 'connecting' || rawState === 'opening') {
      state = 'connecting';
    } else if (rawState === 'qr' || rawState === 'qr_pending') {
      state = 'qr_pending';
    }

    // Se Connected: true mas LoggedIn: false, significa que QR está pendente
    if (data?.Connected === true && data?.LoggedIn === false) {
      state = 'qr_pending';
    }

    const result = {
      connected: state === 'connected',
      state,
      phoneNumber: (data?.phoneNumber || data?.phone || data?.jid || data?.number) as string | undefined,
      qrCode: (data?.qrCode || data?.qr || data?.base64 || data?.Qrcode) as string | undefined,
    };

    console.log(`[Evolution Go] Parsed result:`, result);
    return result;
  }
}
