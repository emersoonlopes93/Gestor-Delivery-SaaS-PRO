import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface WhatsAppCloudErrorResponse {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

@Injectable()
export class WhatsAppCloudService {
  private readonly logger = new Logger('WhatsAppCloudService');

  constructor(private readonly config: ConfigService) {}

  private getAccessToken(): string {
    return String(this.config.get('WHATSAPP_CLOUD_ACCESS_TOKEN') ?? '');
  }

  private getPhoneNumberId(): string {
    return String(this.config.get('WHATSAPP_CLOUD_PHONE_NUMBER_ID') ?? '');
  }

  private getGraphApiVersion(): string {
    return String(this.config.get('WHATSAPP_CLOUD_GRAPH_API_VERSION') ?? 'v19.0');
  }

  private getMessageTemplate(): string {
    return String(this.config.get('WHATSAPP_OTP_MESSAGE_TEMPLATE') ?? 'Seu código de acesso é: {{CODE}}');
  }

  private normalizeBrazilToE164(cleanPhoneDigits: string): string {
    // Espera apenas dígitos.
    // Se já vier com DDI 55, mantém. Caso contrário, assume Brasil.
    if (cleanPhoneDigits.startsWith('55')) return cleanPhoneDigits;
    return `55${cleanPhoneDigits}`;
  }

  async sendOtp(toPhoneDigits: string, code: string): Promise<void> {
    const accessToken = this.getAccessToken();
    const phoneNumberId = this.getPhoneNumberId();

    if (!accessToken || !phoneNumberId) {
      throw new Error('WHATSAPP_CLOUD_* não configurado');
    }

    const to = this.normalizeBrazilToE164(toPhoneDigits);
    const graphVersion = this.getGraphApiVersion();
    const template = this.getMessageTemplate();
    const bodyText = template.replace('{{CODE}}', code);

    const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: {
          preview_url: false,
          body: bodyText,
        },
      }),
    });

    if (!res.ok) {
      const errBody = (await res.json().catch(() => ({}))) as WhatsAppCloudErrorResponse;
      const msg = errBody?.error?.message || `WhatsApp Cloud API error (${res.status})`;
      this.logger.warn(`Falha ao enviar OTP via WhatsApp: ${msg}`);
      throw new Error(msg);
    }
  }
}
