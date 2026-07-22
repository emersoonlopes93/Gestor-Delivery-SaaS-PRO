import { Injectable, Logger } from '@nestjs/common';
import { AiFlowLogger, type AiFlowContext } from '../../common/logging/ai-flow-logger';
import { resolveWhatsAppPresenceTarget } from '../../common/utils/whatsapp-presence.util';
import { WhatsAppInstanceService } from './whatsapp-instance.service';
import { WhatsAppProviderRegistryService } from './whatsapp-provider-registry.service';
import { PrismaService } from '../../database/prisma.service';
import { applyCampaignTemplate } from '../../campaigns/utils/campaign-template.util';
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
 */
@Injectable()
export class WhatsAppSenderService {
  private readonly logger = new Logger('WhatsAppSenderService');

  constructor(
    private readonly instanceService: WhatsAppInstanceService,
    private readonly providerRegistry: WhatsAppProviderRegistryService,
    private readonly prisma: PrismaService,
  ) {}

  async sendText(
    tenantId: string,
    input: WhatsAppSendTextInput,
  ): Promise<WhatsAppSendResult> {
    const { provider, instance } = await this.resolveProvider(tenantId);
    const resolvedInput = await this.resolveOutgoingText(tenantId, input.text);

    return provider.sendText(
      instance.apiUrl,
      instance.apiKey,
      instance.evolutionInstanceId || instance.instanceName,
      { ...input, text: resolvedInput },
    );
  }

  async supportsIdempotencyKey(tenantId: string): Promise<boolean> {
    const { provider } = await this.resolveProvider(tenantId);
    return provider.supportsIdempotencyKey === true;
  }

  async sendMedia(
    tenantId: string,
    input: WhatsAppSendMediaInput,
  ): Promise<WhatsAppSendResult> {
    const { provider, instance } = await this.resolveProvider(tenantId);
    const resolvedCaption = input.caption ? await this.resolveOutgoingText(tenantId, input.caption) : input.caption;

    return provider.sendMedia(
      instance.apiUrl,
      instance.apiKey,
      instance.evolutionInstanceId || instance.instanceName,
      { ...input, caption: resolvedCaption },
    );
  }

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

  async publishStatus(
    tenantId: string,
    input: {
      text?: string;
      mediaUrl?: string;
      mediaType?: string;
      caption?: string;
    },
  ): Promise<WhatsAppSendResult> {
    const { provider, instance } = await this.resolveProvider(tenantId);

    if (typeof provider.publishWhatsAppStatus !== 'function') {
      return { success: false, error: 'Provider does not support publishing WhatsApp status' };
    }

    return provider.publishWhatsAppStatus(
      instance.apiUrl,
      instance.apiKey,
      instance.evolutionInstanceId || instance.instanceName,
      input,
    );
  }

  /**
   * Simula presença (digitando...) — best-effort, nunca lança erro.
   */
  async sendPresence(
    tenantId: string,
    to: string,
    presence: 'composing' | 'recording' | 'paused',
    trace?: AiFlowContext,
  ): Promise<void> {
    const presenceTarget = resolveWhatsAppPresenceTarget(trace?.chatJid, to);
    const ctx: AiFlowContext = {
      tenantId,
      phone: to,
      chatJid: trace?.chatJid,
      messageId: trace?.messageId,
      traceId: trace?.traceId,
      instanceId: trace?.instanceId,
    };

    AiFlowLogger.flow('typing_presence_start', ctx, {
      state: presence,
      destination: presenceTarget,
    });

    try {
      const { provider, instance } = await this.resolveProvider(tenantId);
      const instanceId =
        instance.evolutionInstanceId || instance.instanceName;

      ctx.instanceId = instanceId;

      const result = await provider.sendPresence(
        instance.apiUrl,
        instance.apiKey,
        instanceId,
        presenceTarget,
        presence,
      );

      if (result.success) {
        AiFlowLogger.flow('typing_presence_success', ctx, {
          state: presence,
          status: result.status,
          body: result.bodySummary,
          destination: presenceTarget,
        });
      } else {
        AiFlowLogger.warn('typing_presence_failed', ctx, {
          state: presence,
          status: result.status,
          body: result.bodySummary,
          destination: presenceTarget,
          note: 'best_effort_whatsapp_may_still_hide_typing',
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      AiFlowLogger.warn('typing_presence_failed', ctx, {
        state: presence,
        error: message,
        destination: presenceTarget,
      });
    }
  }

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

  private async resolveProvider(tenantId: string) {
    const instance = await this.instanceService.getInstance(tenantId);
    if (!instance) {
      AiFlowLogger.error('whatsapp_instance_missing', { tenantId });
      throw new Error(`No WhatsApp instance found for tenant ${tenantId}`);
    }

    const provider = await this.providerRegistry.resolveProvider(tenantId);

    AiFlowLogger.flow('whatsapp_provider_resolved', {
      tenantId,
      instanceId: instance.evolutionInstanceId ?? instance.instanceName,
    }, { providerType: provider.providerType });

    return { provider, instance };
  }

  private async resolveOutgoingText(tenantId: string, text: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, slug: true },
    });

    return applyCampaignTemplate(text, {
      link_cardapio: tenant?.slug ? `https://${tenant.slug}.gestordelivery.com` : '',
      nome_loja: tenant?.name || '',
    });
  }
}
