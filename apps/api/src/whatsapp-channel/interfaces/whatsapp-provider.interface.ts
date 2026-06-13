/**
 * Interface de abstração para providers de WhatsApp.
 * Implementações: EvolutionGoProvider, MetaCloudProvider
 *
 * Regra: NENHUMA regra de negócio (catálogo, preço, pedido) deve existir aqui.
 * Este contrato é puramente de canal/transporte.
 */

export interface WhatsAppConnectionStatus {
  connected: boolean;
  phoneNumber?: string;
  state: 'connected' | 'disconnected' | 'connecting' | 'qr_pending';
  qrCode?: string; // base64 ou data URL
}

export interface WhatsAppSendTextInput {
  to: string; // número destino (ex: 5582988898565)
  text: string;
  delay?: number; // ms de delay de digitação
  quotedMessageId?: string;
}

export interface WhatsAppSendMediaInput {
  to: string;
  type: 'image' | 'video' | 'audio' | 'document';
  url: string; // URL pública da mídia
  caption?: string;
  filename?: string;
  delay?: number;
}

export interface WhatsAppSendListInput {
  to: string;
  title: string;
  description: string;
  footerText: string;
  buttonText: string;
  sections: Array<{
    title: string;
    rows: Array<{
      rowId: string;
      title: string;
      description?: string;
    }>;
  }>;
  delay?: number;
}

export interface WhatsAppSendButtonInput {
  to: string;
  title: string;
  description: string;
  footer: string;
  buttons: Array<{
    type: 'reply';
    id: string;
    displayText: string;
  }>;
  delay?: number;
}

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface WhatsAppCreateInstanceInput {
  instanceName: string;
  webhookUrl: string;
  token?: string;
}

export interface WhatsAppCreateInstanceResult {
  instanceId: string;
  instanceName: string;
  token?: string;
}

export interface WhatsAppConnectInput {
  webhookUrl: string;
  subscribe?: string[];
  tenantId?: string;
}

export interface WhatsAppWebhookEvent {
  type: 'message' | 'connection' | 'ack' | 'other';
  tenantId: string;
  from?: string;
  /** JID completo do chat (ex: 5513...@s.whatsapp.net) — preferir para presença */
  chatJid?: string;
  content?: string;
  messageType?: string;
  externalId?: string;
  pushName?: string;
  state?: 'connected' | 'disconnected' | 'connecting' | 'qr_pending';
  phoneNumber?: string;
  status?: string;
  isFromMe?: boolean;
  raw?: unknown;
}

export const WHATSAPP_PROVIDER = 'WHATSAPP_PROVIDER';

export interface IWhatsAppProvider {
  /**
   * Identifica o tipo do provider
   */
  readonly providerType: 'evolution_go' | 'meta_cloud';

  /**
   * Cria uma nova instância no provider externo
   */
  createInstance(
    apiUrl: string,
    apiKey: string,
    input: WhatsAppCreateInstanceInput,
  ): Promise<WhatsAppCreateInstanceResult>;

  /**
   * Conecta uma instância (gera QR code ou pairing code)
   */
  connect(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
    input: WhatsAppConnectInput,
  ): Promise<WhatsAppConnectionStatus>;

  /**
   * Desconecta uma instância
   */
  disconnect(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
  ): Promise<void>;

  /**
   * Consulta status de conexão
   */
  getConnectionStatus(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
  ): Promise<WhatsAppConnectionStatus>;

  /**
   * Obtém QR Code para pareamento
   */
  getQrCode(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
  ): Promise<string | null>; // base64

  /**
   * Gera código de pareamento de 8 dígitos
   */
  generatePairingCode(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
    phone?: string,
  ): Promise<{ pairingCode: string }>;

  /**
   * Envia mensagem de texto
   */
  sendText(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
    input: WhatsAppSendTextInput,
  ): Promise<WhatsAppSendResult>;

  /**
   * Envia mídia (imagem, vídeo, áudio, documento)
   */
  sendMedia(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
    input: WhatsAppSendMediaInput,
  ): Promise<WhatsAppSendResult>;

  /**
   * Envia lista interativa
   */
  sendList(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
    input: WhatsAppSendListInput,
  ): Promise<WhatsAppSendResult>;

  /**
   * Envia botões de resposta rápida
   */
  sendButtons(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
    input: WhatsAppSendButtonInput,
  ): Promise<WhatsAppSendResult>;

  /**
   * Simula presença (composing/typing ou recording)
   */
  sendPresence(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
    to: string,
    presence: 'composing' | 'recording' | 'paused',
  ): Promise<{ success: boolean; status?: number; bodySummary?: string }>;

  /**
   * Marca mensagens como lidas
   */
  markAsRead(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
    chatId: string,
    messageIds: string[],
  ): Promise<void>;

  /**
   * Busca a URL da foto de perfil de um contato
   */
  getProfilePictureUrl(
    apiUrl: string,
    apiKey: string,
    instanceId: string,
    phone: string,
  ): Promise<string | null>;

  /**
   * Faz o parsing de um payload de webhook específico do provider
   */
  parseWebhook(payload: unknown, tenantId: string): WhatsAppWebhookEvent | null;
}
