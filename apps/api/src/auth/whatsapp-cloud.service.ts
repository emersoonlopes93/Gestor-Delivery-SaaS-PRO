import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppSenderService } from '../whatsapp-channel/services/whatsapp-sender.service';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class WhatsAppCloudService {
  private readonly logger = new Logger('WhatsAppCloudService');

  constructor(
    private readonly whatsappSender: WhatsAppSenderService,
    private readonly prisma: PrismaService,
  ) {}

  private normalizeBrazilToE164(cleanPhoneDigits: string): string {
    // Espera apenas dígitos.
    // Se já vier com DDI 55, mantém. Caso contrário, assume Brasil.
    if (cleanPhoneDigits.startsWith('55')) return cleanPhoneDigits;
    return `55${cleanPhoneDigits}`;
  }

  async sendOtp(toPhoneDigits: string, code: string, tenantId?: string): Promise<void> {
    if (!tenantId) {
      // Tenta resolver o tenantId (OTP geralmente é num contexto de storefront, então slug deveria estar disponível)
      const tenant = await this.prisma.tenant.findFirst({ select: { id: true } });
      if (!tenant) throw new Error('Tenant não encontrado para envio de OTP');
      tenantId = tenant.id;
    }

    const to = this.normalizeBrazilToE164(toPhoneDigits);
    const bodyText = `Seu código de acesso é: ${code}`;

    const result = await this.whatsappSender.sendText(tenantId, {
      to,
      text: bodyText,
    });

    if (!result.success) {
      throw new Error(result.error || 'Falha ao enviar OTP via WhatsApp');
    }
  }
}
