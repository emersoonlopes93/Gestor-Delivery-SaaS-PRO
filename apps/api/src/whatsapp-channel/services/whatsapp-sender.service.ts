import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppInstanceService } from './whatsapp-instance.service';
import { WhatsAppProviderRegistryService } from './whatsapp-provider-registry.service';
import type {
  WhatsAppSendTextInput,
  WhatsAppSendMediaInput,
  WhatsAppSendListInput,
  WhatsAppSendButtonInput,
  WhatsAppSendResult,
} from '../interfaces/whatsapp-provider.interface';

/**
 * Facade de envio de mensagens WhatsApp.
 * Resolve automaticamente o provider correto baseado na instância do tenant.
 *
 * NOTA: Este serviço NÃO contém regra de negócio.
 * Ele é uma camada de conveniência sobre o provider.
 */
@Injectable()
export class WhatsAppSenderService {
  private readonly logger = new Logger('WhatsAppSenderService');

  constructor(
    private readonly instanceService: WhatsAppInstanceService,
    private readonly providerRegistry: WhatsAppProviderRegistryService,
  ) {}

  /**
   * Envia texto para um número via instância do tenant
   */
  async sendText(
    tenantId: string,
    input: WhatsAppSendTextInput,
  ): Promise<WhatsAppSendResult> {
    const { provider, instance } = await this.resolveProvider(tenantId);

    return provider.sendText(
      instance.apiUrl,
      instance.apiKey,
      instance.evolutionInstanceId || instance.instanceName,
      input,
    );
  }

  /**
   * Envia mídia para um número via instância do tenant
   */
  async sendMedia(
    tenantId: string,
    input: WhatsAppSendMediaInput,
  ): Promise<WhatsAppSendResult> {
    const { provider, instance } = await this.resolveProvider(tenantId);

    return provider.sendMedia(
      instance.apiUrl,
      instance.apiKey,
      instance.evolutionInstanceId || instance.instanceName,
      input,
    );
  }

  /**
   * Envia lista interativa para um número via instância do tenant
   */
  async sendList(
    tenantId: string,
    input: WhatsAppSendListInput,
  ): Promise<WhatsAppSendResult> {
    const { provider, instance } = await this.resolveProvider(tenantId);

    return provider.sendList(
      instance.apiUrl,
      instance.apiKey,
      instance.evolutionInstanceId || instance.instanceName,
      input,
    );
  }

  /**
   * Envia botões de resposta rápida para um número via instância do tenant
   */
  async sendButtons(
    tenantId: string,
    input: WhatsAppSendButtonInput,
  ): Promise<WhatsAppSendResult> {
    const { provider, instance } = await this.resolveProvider(tenantId);

    return provider.sendButtons(
      instance.apiUrl,
      instance.apiKey,
      instance.evolutionInstanceId || instance.instanceName,
      input,
    );
  }

  /**
   * Simula presença (digitando...)
   */
  async sendPresence(
    tenantId: string,
    to: string,
    presence: 'composing' | 'recording' | 'paused',
  ): Promise<void> {
    const { provider, instance } = await this.resolveProvider(tenantId);

    await provider.sendPresence(
      instance.apiUrl,
      instance.apiKey,
      instance.evolutionInstanceId || instance.instanceName,
      to,
      presence,
    );
  }

  /**
   * Marca mensagens como lidas
   */
  async markAsRead(
    tenantId: string,
    chatId: string,
    messageIds: string[],
  ): Promise<void> {
    const { provider, instance } = await this.resolveProvider(tenantId);

    await provider.markAsRead(
      instance.apiUrl,
      instance.apiKey,
      instance.evolutionInstanceId || instance.instanceName,
      chatId,
      messageIds,
    );
  }

  /**
   * Resolve o provider e instância para um tenant
   */
  private async resolveProvider(tenantId: string) {
    const instance = await this.instanceService.getInstance(tenantId);
    if (!instance) {
      throw new Error(`No WhatsApp instance found for tenant ${tenantId}`);
    }

    const provider = await this.providerRegistry.resolveProvider(tenantId);

    return { provider, instance };
  }
}
