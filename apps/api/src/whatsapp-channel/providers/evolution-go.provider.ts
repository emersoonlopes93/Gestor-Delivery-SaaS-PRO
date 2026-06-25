import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance, isAxiosError } from 'axios';
import { AiFlowLogger } from '../../common/logging/ai-flow-logger';
import { normalizeWhatsAppSendNumber } from '../../common/utils/whatsapp-number.util';
import {
  isNonActionableWebhookEvent,
  summarizeHttpBody,
} from '../../common/utils/whatsapp-presence.util';
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
 * - POST /message/presence (state: composing|paused, isAudio opcional)
 */
@Injectable()
export class EvolutionGoProvider implements IWhatsAppProvider {
  private readonly logger = new Logger('EvolutionGoProvider');
  readonly providerType = 'evolution_go' as const;

  private normalizeQrCode(value?: string | null): string | undefined {
    if (!value) return undefined;
    const trimmed = String(value).trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith('data:image/')) return trimmed;

    // Se vier base64 "puro", normalizar para data URL (o <img src> do browser exige isso).
    // Heurística: sem espaços, comprimento razoável, e apenas chars de base64.
    const base64Like =
      trimmed.length > 80 &&
      !/\s/.test(trimmed) &&
      /^[A-Za-z0-9+/=]+$/.test(trimmed);

    if (base64Like) {
      return `data:image/png;base64,${trimmed}`;
    }

    return trimmed;
  }

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

  /** Cliente com header instanceId — obrigatório em vários endpoints Evolution-Go */
  private buildInstanceClient(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
  ): AxiosInstance {
    return axios.create({
      baseURL: apiUrl.replace(/\/+$/, ''),
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
        instanceId,
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
    const client = axios.create({
      baseURL: apiUrl.replace(/\/+$/, ''),
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
        instanceId: instanceId,
      },
      timeout: 30_000,
    });

    try {
      this.logger.log(`[WHATSAPP_CONNECT_START] tenantId=${input.tenantId || 'n/a'} instanceId=${instanceId} webhookUrl=${input.webhookUrl.replace(/secret=.*$/, 'secret=***')}`);

      const requestBody = {
        webhookUrl: input.webhookUrl,
        subscribe: ["MESSAGE", "CONNECTION", "QRCODE"],
        immediate: true,
      };

      this.logger.log(`[WHATSAPP_CONNECT] subscribe=["MESSAGE","CONNECTION","QRCODE"]`);

      const { data } = await client.post('/instance/connect', requestBody);
      const dataRec = data as Record<string, unknown>;

      // Log all root keys for debugging
      const rootKeys = Object.keys(dataRec);
      this.logger.log(`[WHATSAPP_QR_RESPONSE] qrPresent=${!!this.extractQrFromObject(dataRec)} keys=[${rootKeys.join(', ')}]`);

      // Try to extract QR from the full response first (not just .data sub-object)
      const rawQrFromRoot = this.extractQrFromObject(dataRec);

      // Parse the connection status from response (tries both root and .data)
      const statusSource = (dataRec?.data && typeof dataRec.data === 'object')
        ? (dataRec.data as Record<string, unknown>)
        : dataRec;
      const parsed = this.parseConnectionStatus(statusSource);

      // Override qrCode if found directly at root
      if (!parsed.qrCode && rawQrFromRoot) {
        parsed.qrCode = this.normalizeQrCode(rawQrFromRoot) ?? undefined;
        parsed.state = 'qr_pending';
      }

      // If QR code not present and state suggests pairing needed, attempt explicit fetch
      if (!parsed.qrCode && (parsed.state === 'qr_pending' || parsed.state === 'connecting' || parsed.state === 'disconnected')) {
        this.logger.debug('QR code missing after connect, attempting explicit fetch via getQrCode');
        const fetchedQr = await this.getQrCode(apiUrl, apiKey, instanceId);
        if (fetchedQr) {
          parsed.qrCode = fetchedQr;
          parsed.state = 'qr_pending';
        }
      }

      this.logger.log(`[WHATSAPP_CONNECT_RESULT] tenantId=${input.tenantId || 'n/a'} instanceId=${instanceId} state=${parsed.state} qrPresent=${!!parsed.qrCode}`);

      return parsed;
    } catch (error: unknown) {
      const msg = isAxiosError(error) ? `status=${error.response?.status} body=${JSON.stringify(error.response?.data)}` : (error instanceof Error ? error.message : 'unknown');
      this.logger.error(`[WHATSAPP_ERROR] step=connect tenantId=${input.tenantId || 'n/a'} instanceId=${instanceId} ${msg}`);
      throw error;
    }
  }

  async disconnect(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
  ): Promise<void> {
    const client = axios.create({
      baseURL: apiUrl.replace(/\/+$/, ''),
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
        instanceId,
      },
      timeout: 30_000,
    });
    try {
      // Try POST /instance/disconnect first (may not work in all Evolution Go versions)
      const { data } = await client.post('/instance/disconnect');
      const dataRec = data as Record<string, unknown>;
      this.logger.log(`Disconnect response from Evolution Go: ${JSON.stringify(dataRec)}`);
      this.logger.log(`[WHATSAPP_DISCONNECT] instanceId=${instanceId} action=disconnected localStatus=disconnected`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`[WHATSAPP_WARN] step=disconnect instanceId=${instanceId} POST /instance/disconnect failed: ${message}. This is expected if endpoint doesn't exist. Proceeding with local disconnection only.`);
      // Don't throw error - we still want to mark as disconnected locally
    }
  }

  async deleteInstance(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
  ): Promise<void> {
    const client = axios.create({
      baseURL: apiUrl.replace(/\/+$/, ''),
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
        instanceId,
      },
      timeout: 30_000,
    });

    try {
      await client.post('/instance/logout');
    } catch (logoutError) {
      const message = logoutError instanceof Error ? logoutError.message : 'Unknown error';
      this.logger.warn(`[WHATSAPP_WARN] step=delete_instance instanceId=${instanceId} logout failed: ${message}`);
    }

    try {
      await client.delete(`/instance/delete/${instanceId}`);
      this.logger.log(`[WHATSAPP_DELETE_INSTANCE] instanceId=${instanceId} deleted_remote=true`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`[WHATSAPP_WARN] step=delete_instance instanceId=${instanceId} delete failed: ${message}`);
      throw error;
    }
  }

  async generatePairingCode(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
    phone?: string,
  ): Promise<{ pairingCode: string }> {
    const client = this.buildInstanceClient(apiUrl, apiKey, instanceId);
    try {
      this.logger.log(`Generating pairing code for instance: ${instanceId}, phone: ${phone}`);

      const cleanPhone = phone?.replace(/\D/g, '');
      if (!cleanPhone) {
        throw new Error('Número de telefone é obrigatório para gerar o código de pareamento.');
      }

      const requestBody = {
        phone: cleanPhone,
        subscribe: ["MESSAGE", "CONNECTION", "QRCODE"],
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
      this.logger.error(`[WHATSAPP_ERROR] step=pair instanceId=${instanceId} status=${isAxiosError(error) ? error.response?.status : 'unknown'} body=${isAxiosError(error) ? JSON.stringify(error.response?.data) : 'unknown'}`);
      throw error;
    }
  }

  async getConnectionStatus(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
  ): Promise<WhatsAppConnectionStatus> {
    const client = this.buildInstanceClient(apiUrl, apiKey, instanceId);
    try {
      console.log(`[Evolution Go] Getting status for instance ${instanceId}`);
      const { data } = await client.get('/instance/status');
      console.log(`[Evolution Go] Status response:`, data);
      const parsed = this.parseConnectionStatus(data?.data || data);
      console.log(`[Evolution Go] Parsed status:`, parsed);

      // Se conectado e não tem telefone, não vamos tentar obter (endpoints não funcionam)
      // O Evolution Go não expõe o número facilmente, então vamos deixar sem telefone

      return parsed;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`getConnectionStatus failed: ${message}`);
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
    const client = this.buildInstanceClient(apiUrl, apiKey, instanceId);
    try {
      console.log(`[Evolution Go] Getting QR code for instance ${instanceId}`);
      const { data } = await client.get('/instance/qr');
      console.log(`[Evolution Go] QR response:`, data);
      const responseData = (data && typeof data === 'object' && 'data' in data)
        ? (data as { data: Record<string, unknown> }).data
        : (data as Record<string, unknown>);
      const qrCode = (responseData?.qrCode || responseData?.qr || responseData?.base64 || responseData?.Qrcode || null) as string | null;
      console.log(`[Evolution Go] Extracted QR code:`, qrCode ? '***FOUND***' : 'NOT FOUND');
      return this.normalizeQrCode(qrCode) ?? null;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`getQrCode failed: ${message}`);
      return null;
    }
  }


  async sendText(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
    input: WhatsAppSendTextInput,
  ): Promise<WhatsAppSendResult> {
    const client = this.buildInstanceClient(apiUrl, apiKey, instanceId);
    const number = normalizeWhatsAppSendNumber(input.to);

    AiFlowLogger.flow('evolution_send_start', {
      instanceId,
      phone: number,
    }, { textLength: input.text.length });

    try {
      const body: Record<string, unknown> = {
        number,
        text: input.text,
      };
      if (input.delay) body.delay = input.delay;
      if (input.quotedMessageId) {
        body.quoted = { messageId: input.quotedMessageId };
      }

      const { data, status } = await client.post('/send/text', body);
      const responseData = (data && typeof data === 'object' && 'data' in data)
        ? (data as { data: Record<string, unknown> }).data
        : (data as Record<string, unknown>);

      AiFlowLogger.flow('evolution_send_success', {
        instanceId,
        phone: number,
      }, { status, messageId: String(responseData?.messageId || (responseData?.key as Record<string, unknown>)?.id || responseData?.id || '') });

      return {
        success: true,
        messageId: (responseData?.messageId || (responseData?.key as Record<string, unknown>)?.id || responseData?.id) ? String(responseData?.messageId || (responseData?.key as Record<string, unknown>)?.id || responseData?.id) : undefined,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const status = isAxiosError(error) ? error.response?.status : undefined;
      const body = isAxiosError(error) ? JSON.stringify(error.response?.data) : undefined;
      AiFlowLogger.error('evolution_send', { instanceId, phone: number }, { status, body, error: message });
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
        messageId: (responseData?.messageId || (responseData?.key as Record<string, unknown>)?.id || responseData?.id) ? String(responseData?.messageId || (responseData?.key as Record<string, unknown>)?.id || responseData?.id) : undefined,
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
        messageId: (responseData?.messageId || (responseData?.key as Record<string, unknown>)?.id || responseData?.id) ? String(responseData?.messageId || (responseData?.key as Record<string, unknown>)?.id || responseData?.id) : undefined,
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
      const body: Record<string, unknown> = {
        number: input.to,
        title: input.title,
        description: input.description,
        footer: input.footer,
        buttons: input.buttons.map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.displayText },
        })),
      };
      if (input.delay) body.delay = input.delay;

      const { data } = await client.post('/send/buttons', body);
      const dataRec = data as Record<string, unknown>;
      const responseData = (dataRec?.data || dataRec) as Record<string, unknown>;

      return {
        success: true,
        messageId: (responseData?.messageId || (responseData?.key as Record<string, unknown>)?.id || responseData?.id) ? String(responseData?.messageId || (responseData?.key as Record<string, unknown>)?.id || responseData?.id) : undefined,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`sendButtons failed: ${message}`);
      return { success: false, error: message };
    }
  }

  async publishWhatsAppStatus(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
    input: {
      text?: string;
      mediaUrl?: string;
      mediaType?: string;
      caption?: string;
    },
  ): Promise<WhatsAppSendResult> {
    const client = this.buildInstanceClient(apiUrl, apiKey, instanceId);
    const kind = input.mediaUrl ? 'media' : 'text';
    const contentLength = (input.text || input.caption || '').length;
    this.logger.log(
      `[STATUS_PUBLISH] instanceId=${instanceId} kind=${kind} hasMedia=${Boolean(input.mediaUrl)} mediaType=${input.mediaType || 'text'} contentLength=${contentLength} target=status@broadcast`,
    );

    try {
      if (input.mediaUrl) {
        const mediaType = input.mediaType === 'video' ? 'video' : 'image';
        const mediaBody: { number: string; type: 'image' | 'video'; media: string; caption: string } = {
          number: 'status@broadcast',
          type: mediaType,
          media: input.mediaUrl,
          caption: input.text || input.caption || '',
        };
        const result = await this.postStatusMedia(client, mediaBody);
        return result;
      } else if (input.text) {
        const textBody = {
          number: 'status@broadcast',
          text: input.text,
        };
        const result = await this.postStatusText(client, textBody);
        return result;
      } else {
        return { success: false, error: 'No content provided for status' };
      }
    } catch (error: unknown) {
      const message = isAxiosError(error) ? error.response?.data?.message || error.message : (error as Error).message;
      this.logger.error(`publishWhatsAppStatus failed: ${message}`);
      return { success: false, error: message };
    }
  }

  private async postStatusText(
    client: AxiosInstance,
    body: { number: string; text: string },
  ): Promise<WhatsAppSendResult> {
    try {
      const { data } = await client.post('/send/text', body);
      const responseData = (data && typeof data === 'object' && 'data' in data)
        ? (data as { data: Record<string, unknown> }).data
        : (data as Record<string, unknown>);

      return {
        success: true,
        messageId: (responseData?.messageId || (responseData?.key as Record<string, unknown>)?.id || responseData?.id) ? String(responseData?.messageId || (responseData?.key as Record<string, unknown>)?.id || responseData?.id) : undefined,
      };
    } catch (error: unknown) {
      if (isAxiosError(error) && error.response?.status === 404) {
        this.logger.warn('publishWhatsAppStatus primary route /send/text returned 404, retrying legacy /message/sendText.');
        try {
          const { data } = await client.post('/message/sendText', body);
          return {
            success: true,
            messageId: (data?.key?.id || data?.id) ? String(data?.key?.id || data?.id) : undefined,
          };
        } catch (legacyError: unknown) {
          const legacyMessage = isAxiosError(legacyError)
            ? legacyError.response?.data?.message || legacyError.message
            : (legacyError as Error).message;
          this.logger.error(`publishWhatsAppStatus fallback /message/sendText failed: ${legacyMessage}`);
          return { success: false, error: legacyMessage };
        }
      }

      const message = isAxiosError(error) ? error.response?.data?.message || error.message : (error as Error).message;
      this.logger.error(`publishWhatsAppStatus failed: ${message}`);
      return { success: false, error: message };
    }
  }

  private async postStatusMedia(
    client: AxiosInstance,
    body: { number: string; type: 'image' | 'video'; media: string; caption: string },
  ): Promise<WhatsAppSendResult> {
    const mediaBody = {
      number: body.number,
      type: body.type,
      url: body.media,
      caption: body.caption,
    };

    try {
      const { data } = await client.post('/send/media', mediaBody);
      const responseData = (data && typeof data === 'object' && 'data' in data)
        ? (data as { data: Record<string, unknown> }).data
        : (data as Record<string, unknown>);

      return {
        success: true,
        messageId: (responseData?.messageId || (responseData?.key as Record<string, unknown>)?.id || responseData?.id) ? String(responseData?.messageId || (responseData?.key as Record<string, unknown>)?.id || responseData?.id) : undefined,
      };
    } catch (error: unknown) {
      if (isAxiosError(error) && error.response?.status === 404) {
        this.logger.warn('publishWhatsAppStatus primary route /send/media returned 404, retrying legacy /message/sendMedia.');
        try {
          const { data } = await client.post('/message/sendMedia', {
            number: body.number,
            mediatype: body.type,
            mimetype: body.type === 'video' ? 'video/mp4' : 'image/jpeg',
            caption: body.caption,
            media: body.media,
          });
          return {
            success: true,
            messageId: (data?.key?.id || data?.id) ? String(data?.key?.id || data?.id) : undefined,
          };
        } catch (legacyError: unknown) {
          const legacyMessage = isAxiosError(legacyError)
            ? legacyError.response?.data?.message || legacyError.message
            : (legacyError as Error).message;
          this.logger.error(`publishWhatsAppStatus fallback /message/sendMedia failed: ${legacyMessage}`);
          return { success: false, error: legacyMessage };
        }
      }

      const message = isAxiosError(error) ? error.response?.data?.message || error.message : (error as Error).message;
      this.logger.error(`publishWhatsAppStatus failed: ${message}`);
      return { success: false, error: message };
    }
  }

  async sendPresence(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
    to: string,
    presence: 'composing' | 'recording' | 'paused',
  ): Promise<{ success: boolean; status?: number; bodySummary?: string }> {
    const client = this.buildInstanceClient(apiUrl, apiKey, instanceId);
    const number = to.includes('@')
      ? to
      : normalizeWhatsAppSendNumber(to);

    const state = presence === 'paused' ? 'paused' : 'composing';
    const isAudio = presence === 'recording';

    try {
      const response = await client.post('/message/presence', {
        number,
        state,
        isAudio,
      });
      return {
        success: true,
        status: response.status,
        bodySummary: summarizeHttpBody(response.data),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const status = isAxiosError(error) ? error.response?.status : undefined;
      const bodySummary = isAxiosError(error)
        ? summarizeHttpBody(error.response?.data)
        : undefined;
      this.logger.warn(
        `sendPresence failed (Evolution-Go /message/presence): ${message} status=${status ?? 'n/a'}`,
      );
      return { success: false, status, bodySummary };
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

  parseWebhook(payload: unknown, tenantId: string): WhatsAppWebhookEvent | null {
    if (!payload || typeof payload !== 'object') return null;
    const dataRec = payload as Record<string, unknown>;
    const baseCtx = this.extractFlowContext(dataRec, tenantId);

    // Padrão Evolution-Go: "event" e "data"
    // Tornar insensível a maiúsculas/minúsculas para maior compatibilidade
    const eventTypeRaw = String(dataRec.event || '');
    const eventType = eventTypeRaw.toLowerCase();

    if (isNonActionableWebhookEvent(eventTypeRaw)) {
      this.logger.log(`[AI_FLOW_DEBUG] ignored_event event=${eventTypeRaw}`);
      AiFlowLogger.debug('webhook_event_skip', baseCtx, { event: eventTypeRaw });
      return null;
    }

    if (eventType === 'message') {
      const data = (dataRec.data || {}) as Record<string, unknown>;
      const info = (data?.Info || data?.key || {}) as Record<string, unknown>;
      const message = (data?.Message || data?.message || {}) as Record<string, unknown>;

      const chatJid = String(info?.Chat || info?.Sender || info?.remoteJid || '');
      const remoteJid = chatJid;
      const messageId = String(info?.ID || info?.id || '');
      const pushName = String(info?.PushName || info?.pushName || data?.pushName || '');
      const ctx = {
        ...baseCtx,
        messageId: messageId || baseCtx.messageId,
        remoteJid,
        chatJid: chatJid.includes('@') ? chatJid : undefined,
        sender: String(info?.Sender || ''),
        pushName,
      };

      // Ignorar status@broadcast ou qualquer broadcast cedo
      if (remoteJid.includes('status@broadcast') || remoteJid.includes('broadcast')) {
        this.logger.log(`[AI_FLOW_DEBUG] ignored_broadcast remoteJid=${remoteJid}`);
        return null;
      }

      // Ignorar grupos ou mensagens sem remetente
      if (!remoteJid) {
        AiFlowLogger.ignored('missing_remote_jid', ctx);
        return null;
      }
      if (remoteJid.includes('@g.us')) {
        AiFlowLogger.ignored('group_message', ctx);
        return null;
      }

      // Vamos capturar mensagens fromMe para disparar o Handoff Automático
      const isFromMe = info?.IsFromMe === true || info?.fromMe === true;

      let content = '';
      if (typeof message.conversation === 'string') content = message.conversation;

      if (!content) {
        const ext = message.extendedTextMessage;
        if (ext && typeof ext === 'object' && !Array.isArray(ext)) {
          const text = (ext as Record<string, unknown>).text;
          if (typeof text === 'string') content = text;
        }
      }

      if (!content) {
        const img = message.imageMessage;
        if (img && typeof img === 'object' && !Array.isArray(img)) {
          const caption = (img as Record<string, unknown>).caption;
          if (typeof caption === 'string') content = caption;
        }
      }

      if (!content) {
        AiFlowLogger.ignored('empty_text', ctx);
        return null;
      }

      this.logger.log(`[AI_FLOW] received_webhook event=Message instanceId=${baseCtx.instanceId || 'unknown'} messageId=${messageId}`);
      AiFlowLogger.flow('parsed_message', ctx, { textLength: content.length, event: eventTypeRaw, pushName: pushName || 'none' });

      return {
        type: 'message',
        tenantId,
        from: remoteJid.replace(/@.*$/, ''),
        chatJid: chatJid.includes('@') ? chatJid : undefined,
        content,
        messageType: 'text',
        externalId: messageId,
        pushName: pushName || undefined,
        isFromMe,
        raw: payload,
      };
    }

    // Fallback para padrões legados ou mensagens upsert (compatibilidade)
    const legacyEventType = (dataRec.event || (dataRec.data as Record<string, unknown>)?.event || dataRec.type || 'unknown') as string;
    const legacyEventTypeLower = legacyEventType.toLowerCase();

    if (legacyEventTypeLower === 'messages.upsert' || legacyEventTypeLower === 'message') {
      const data = (dataRec.data || dataRec) as Record<string, unknown>;
      const key = data?.key as Record<string, unknown> | undefined;
      const remoteJid = (key?.remoteJid || data?.remoteJid || data?.from) as string | undefined;

      if (remoteJid && (remoteJid.includes('status@broadcast') || remoteJid.includes('broadcast'))) {
        this.logger.log(`[AI_FLOW_DEBUG] ignored_broadcast remoteJid=${remoteJid}`);
        return null;
      }

      if (!remoteJid || remoteJid.includes('@g.us')) return null;
      const isFromMe = key?.fromMe === true;

      const content = this.extractMessageContent(data);
      if (!content) return null;

      this.logger.log(`[AI_FLOW] received_webhook event=Message legacy=true`);

      return {
        type: 'message',
        tenantId,
        from: remoteJid.replace(/@.*$/, ''),
        content,
        messageType: this.detectMessageType(data),
        externalId: String(key?.id || data?.messageId || data?.id),
        isFromMe,
        raw: payload
      };
    }

    if (eventType === 'connection.update') {
      const data = (dataRec.data || dataRec) as Record<string, unknown>;
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
      const data = (dataRec.data || dataRec) as Record<string, unknown>;
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

    AiFlowLogger.debug('unsupported_event', baseCtx, { event: eventTypeRaw || 'unknown' });
    return null;
  }

  async getProfilePictureUrl(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
    phone: string,
  ): Promise<string | null> {
    try {
      const client = this.buildInstanceClient(apiUrl, apiKey, instanceId);
      // Alguns endpoints em Evolution Go para foto são GET /chat/fetchProfilePictureUrl
      // ou POST /chat/profilePic. Tentaremos o GET por padrão passando number.
      // O number pode ser com ou sem @s.whatsapp.net, o provider Evolution Go normalmente lida com isso.
      const normalizedNumber = normalizeWhatsAppSendNumber(phone);
      
      const { data } = await client.get('/chat/fetchProfilePictureUrl', {
        params: { number: normalizedNumber },
      });

      const responseData = (data && typeof data === 'object' && 'data' in data)
        ? (data as { data: Record<string, unknown> }).data
        : (data as Record<string, unknown>);

      const url = responseData?.profilePictureUrl || responseData?.picture || responseData?.url;
      if (typeof url === 'string' && url.trim()) {
        return url.trim();
      }

      return null;
    } catch (error: unknown) {
      if (isAxiosError(error) && error.response?.status === 404) {
        // Contato sem foto ou endpoint diferente
        return null;
      }
      this.logger.debug(`Falha ao buscar foto de perfil para ${phone}: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
      return null; // Silencia o erro para não quebrar o fluxo
    }
  }

  private extractFlowContext(
    payload: Record<string, unknown>,
    tenantId: string,
  ): { tenantId: string; instanceId?: string; messageId?: string; remoteJid?: string; sender?: string } {
    const data = (payload.data || {}) as Record<string, unknown>;
    const info = (data?.Info || data?.key || {}) as Record<string, unknown>;
    const instanceId = typeof payload.instanceId === 'string' ? payload.instanceId : undefined;
    const messageId = String(info?.ID || info?.id || '');
    return {
      tenantId,
      instanceId,
      messageId: messageId || undefined,
      remoteJid: String(info?.Chat || info?.Sender || info?.remoteJid || '') || undefined,
      sender: String(info?.Sender || '') || undefined,
    };
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

  private extractQrFromObject(obj: Record<string, unknown> | null | undefined): string | undefined {
    if (!obj || typeof obj !== 'object') return undefined;

    const keys = [
      'qr', 'qrcode', 'qrCode', 'Qrcode', 'base64', 'code', 'pairingCode', 'pairing_code'
    ];

    // Check root keys
    for (const key of keys) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      const val = obj[key];
      if (typeof val === 'string' && val.trim()) {
        return val.trim();
      }
    }

    // Check data key
    const dataVal = obj.data;
    if (dataVal && typeof dataVal === 'object' && !Array.isArray(dataVal)) {
      const dataObj = dataVal as Record<string, unknown>;
      for (const key of keys) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
        const val = dataObj[key];
        if (typeof val === 'string' && val.trim()) {
          return val.trim();
        }
      }
    }

    // Check nested under instance
    const instanceVal = obj.instance;
    if (instanceVal && typeof instanceVal === 'object' && !Array.isArray(instanceVal)) {
      const instanceObj = instanceVal as Record<string, unknown>;
      for (const key of keys) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
        const val = instanceObj[key];
        if (typeof val === 'string' && val.trim()) {
          return val.trim();
        }
      }
    }

    return undefined;
  }

  private parseConnectionStatus(data: Record<string, unknown>): WhatsAppConnectionStatus {
    if (!data) {
      return { connected: false, state: 'disconnected' };
    }

    const rawState = (
      String(data?.state || data?.status || data?.connectionStatus || '')
    ).toLowerCase();

    let state: WhatsAppConnectionStatus['state'] = 'disconnected';

    const connectedRaw = data?.Connected === true || data?.connected === true;
    const loggedInRaw = data?.LoggedIn === true || data?.loggedIn === true;

    if (connectedRaw && loggedInRaw) {
      state = 'connected';
    } else if (connectedRaw && !loggedInRaw) {
      state = 'qr_pending';
    } else if (rawState === 'open' || rawState === 'connected') {
      state = 'connected';
    } else if (rawState === 'connecting' || rawState === 'opening') {
      state = 'connecting';
    } else if (rawState === 'qr' || rawState === 'qr_pending' || rawState === 'pairing_required') {
      state = 'qr_pending';
    }

    const rawQr = this.extractQrFromObject(data);
    const normalizedQr = this.normalizeQrCode(rawQr);

    // Tenta encontrar o phoneNumber em vários locais possíveis da resposta da Evolution API
    let foundPhoneNumber: string | undefined;

    if (data?.phoneNumber) foundPhoneNumber = String(data.phoneNumber);
    else if (data?.phone) foundPhoneNumber = String(data.phone);
    else if (data?.jid) foundPhoneNumber = String(data.jid);
    else if (data?.number) foundPhoneNumber = String(data.number);
    else if (data?.ownerJid) foundPhoneNumber = String(data.ownerJid);
    else if (data?.owner) foundPhoneNumber = String(data.owner);

    // connection.user.id ou connection.user.number
    if (!foundPhoneNumber && data?.connection && typeof data.connection === 'object') {
      const conn = data.connection as Record<string, unknown>;
      if (conn.user && typeof conn.user === 'object') {
        const user = conn.user as Record<string, unknown>;
        if (user.id) foundPhoneNumber = String(user.id);
        else if (user.number) foundPhoneNumber = String(user.number);
      }
    }

    // instance.owner ou instance.phoneNumber
    if (!foundPhoneNumber && data?.instance && typeof data.instance === 'object') {
      const inst = data.instance as Record<string, unknown>;
      if (inst.owner) foundPhoneNumber = String(inst.owner);
      else if (inst.phoneNumber) foundPhoneNumber = String(inst.phoneNumber);
    }

    const result = {
      connected: state === 'connected',
      state,
      phoneNumber: this.normalizeConnectedPhoneNumber(foundPhoneNumber),
      qrCode: normalizedQr,
    };

    const keysFiltered = Object.keys(data).filter(k => {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') return false;
      return data[k] !== undefined && data[k] !== null;
    });
    this.logger.log(`[WHATSAPP_STATUS_PARSE] connectedRaw=${connectedRaw} loggedInRaw=${loggedInRaw} mapped=${state} qrPresent=${!!normalizedQr}`);
    this.logger.log(`[WHATSAPP_QR] qrPresent=${!!normalizedQr} keys=[${keysFiltered.join(', ')}]`);

    return result;
  }

  private normalizeConnectedPhoneNumber(value?: string): string | undefined {
    if (!value) return undefined;
    const normalized = normalizeWhatsAppSendNumber(value);
    return normalized || undefined;
  }
}
