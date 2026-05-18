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
      // Garantir que temos um token
      const token = input.token || Math.random().toString(36).substring(7);

      const { data } = await client.post('/instance/create', {
        name: input.instanceName,
        token: token,
      });

      const responseData = data?.data || data;

      this.logger.log(`Instance created: ${input.instanceName}`);
      return {
        instanceId: responseData?.instanceId || responseData?.id || input.instanceName,
        instanceName: responseData?.name || input.instanceName,
        token: responseData?.token || token,
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
      console.log(`[Evolution Go] Connecting instance ${instanceId} with webhook: ${input.webhookUrl}`);
      
      // Primeiro, buscar o QR code diretamente
      console.log(`[Evolution Go] Fetching QR code first...`);
      try {
        const qrResponse = await client.get('/instance/qr');
        console.log(`[Evolution Go] QR response:`, qrResponse.data);
        const qrData = qrResponse.data?.data || qrResponse.data;
        const qrCode = qrData?.qrCode || qrData?.qr || qrData?.base64 || qrData?.Qrcode;
        
        if (qrCode) {
          console.log(`[Evolution Go] QR code found directly:`, qrCode ? 'YES' : 'NO');
          return {
            connected: false,
            state: 'qr_pending',
            qrCode: qrCode,
          };
        }
      } catch (qrError: any) {
        console.warn(`[Evolution Go] Failed to get QR code first: ${qrError.message}`);
      }

      // Se não tiver QR, tentar conectar
      const requestBody = {
        webhookUrl: input.webhookUrl,
        subscribe: input.subscribe || [
          'messages.upsert',
          'connection.update',
          'messages.update',
        ],
      };

      console.log(`[Evolution Go] Request body:`, requestBody);
      
      const { data } = await client.post('/instance/connect', requestBody);
      
      console.log(`[Evolution Go] Connect response:`, data);

      return this.parseConnectionStatus(data?.data || data);
    } catch (error: any) {
      this.logger.error(`connect failed: ${error.message}`);
      console.error(`[Evolution Go] Connect error:`, error.response?.data || error.message);
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

  async generatePairingCode(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
    phone?: string,
  ): Promise<{ pairingCode: string }> {
    const client = this.buildClient(apiUrl, apiKey);
    try {
      this.logger.log(`[Evolution Go] Generating pairing code for instance: ${instanceId}, phone: ${phone}`);
      
      const cleanPhone = phone?.replace(/\D/g, '');
      if (!cleanPhone) {
        throw new Error('Número de telefone é obrigatório para gerar o código de pareamento.');
      }

      const requestBody = {
        instanceName: instanceId,
        phone: cleanPhone
      };

      this.logger.debug(`[Evolution Go] Simple Pair Request Body: ${JSON.stringify(requestBody)}`);

      const { data } = await client.post('/instance/pair', requestBody);
      this.logger.debug(`[Evolution Go] Pair Response: ${JSON.stringify(data)}`);
      
      const responseData = data?.data || data;
      const pairingCode = 
        responseData?.PairingCode || 
        responseData?.pairingCode || 
        responseData?.code || 
        responseData?.pairing_code;
      
      if (!pairingCode) {
        this.logger.error(`[Evolution Go] No pairing code in response: ${JSON.stringify(data)}`);
        throw new Error('Provedor não retornou o código de pareamento. O servidor da Evolution pode precisar de um restart.');
      }

      this.logger.log(`[Evolution Go] Pairing code generated successfully: ${pairingCode}`);
      return { pairingCode };
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || error.response?.data?.error || error.message;
      this.logger.error(`[Evolution Go] generatePairingCode failed: ${errorMsg}`);
      
      if (error.response?.data) {
        this.logger.error(`[Evolution Go] Error data: ${JSON.stringify(error.response.data)}`);
      }
      
      throw new Error(`Falha ao gerar código de pareamento: ${errorMsg}`);
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
      const responseData = (data as any)?.data || data;
      return {
        success: true,
        messageId: responseData?.messageId || responseData?.key?.id || responseData?.id,
      };
    } catch (error) {
      const err = error as any;
      this.logger.error(`sendText failed: ${err.message}`);
      return { success: false, error: err.message };
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
      const responseData = (data as any)?.data || data;
      return {
        success: true,
        messageId: responseData?.messageId || responseData?.key?.id || responseData?.id,
      };
    } catch (error) {
      const err = error as any;
      this.logger.error(`sendMedia failed: ${err.message}`);
      return { success: false, error: err.message };
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
      const responseData = (data as any)?.data || data;
      return {
        success: true,
        messageId: responseData?.messageId || responseData?.key?.id || responseData?.id,
      };
    } catch (error) {
      const err = error as any;
      this.logger.error(`sendList failed: ${err.message}`);
      return { success: false, error: err.message };
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
      const responseData = (data as any)?.data || data;
      return {
        success: true,
        messageId: responseData?.messageId || responseData?.key?.id || responseData?.id,
      };
    } catch (error) {
      const err = error as any;
      this.logger.error(`sendButtons failed: ${err.message}`);
      return { success: false, error: err.message };
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
    } catch (error) {
      const err = error as any;
      this.logger.warn(`markAsRead failed: ${err.message}`);
    }
  }

  parseWebhook(payload: Record<string, any>, tenantId: string): any {
    const eventType = payload?.event || payload?.data?.event || payload?.type || 'unknown';
    
    if (eventType === 'messages.upsert') {
      const data = payload?.data || payload;
      const remoteJid = (data as any)?.key?.remoteJid || (data as any)?.remoteJid || (data as any)?.from;
      if (!remoteJid || remoteJid.includes('@g.us')) return null;
      if ((data as any)?.key?.fromMe) return null;

      const content = this.extractMessageContent(data);
      if (!content) return null;

      return {
        type: 'message',
        tenantId,
        from: remoteJid.replace(/@.*$/, ''),
        content,
        messageType: this.detectMessageType(data),
        externalId: (data as any)?.key?.id || (data as any)?.messageId || (data as any)?.id,
        raw: payload
      };
    }

    if (eventType === 'connection.update') {
      const data = payload?.data || payload;
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
      const data = payload?.data || payload;
      return {
        type: 'ack',
        tenantId,
        externalId: (data as any)?.key?.id || (data as any)?.messageId || (data as any)?.id,
        status: (data as any)?.update?.status || (data as any)?.status,
        raw: payload
      };
    }

    return null;
  }


  private extractMessageContent(data: any): string | null {
    const message = data?.message || data;
    if (typeof message === 'string') return message;
    if ((message as any)?.conversation) return (message as any).conversation;
    if ((message as any)?.extendedTextMessage?.text) return (message as any).extendedTextMessage.text;
    if ((message as any)?.imageMessage?.caption) return (message as any).imageMessage.caption;
    if ((message as any)?.videoMessage?.caption) return (message as any).videoMessage.caption;
    if ((message as any)?.buttonsResponseMessage?.selectedDisplayText) return (message as any).buttonsResponseMessage.selectedDisplayText;
    if ((message as any)?.listResponseMessage?.title) return (message as any).listResponseMessage.title;
    return null;
  }

  private detectMessageType(data: any): string {
    const message = data?.message || data;
    if ((message as any)?.imageMessage) return 'image';
    if (message?.videoMessage) return 'video';
    if (message?.audioMessage) return 'audio';
    if (message?.documentMessage) return 'document';
    if (message?.stickerMessage) return 'sticker';
    if (message?.locationMessage) return 'location';
    if (message?.contactMessage) return 'contact';
    return 'text';
  }

  private parseConnectionStatus(data: any): WhatsAppConnectionStatus {
    if (!data) {
      return { connected: false, state: 'disconnected' };
    }

    console.log(`[Evolution Go] Parsing status from:`, data);

    const rawState = (
      data?.state || data?.status || data?.connectionStatus || ''
    ).toString().toLowerCase();

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
      phoneNumber: data?.phoneNumber || data?.phone || data?.jid || data?.number,
      qrCode: data?.qrCode || data?.qr || data?.base64 || data?.Qrcode,
    };

    console.log(`[Evolution Go] Parsed result:`, result);
    return result;
  }
}
