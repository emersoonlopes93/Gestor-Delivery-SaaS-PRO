import {
  Controller,
  Post,
  Body,
  Headers,
  Logger,
  HttpCode,
  Inject,
  forwardRef,
  Query,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { WhatsAppProviderRegistryService } from '../services/whatsapp-provider-registry.service';
import type { WhatsAppWebhookEvent } from '../interfaces/whatsapp-provider.interface';
import { WhatsAppInstanceStatus } from '@prisma/client';
import { AiOrchestratorService } from '../../ai-agent/services/ai-orchestrator.service';
import { AiAgentConfigService } from '../../ai-agent/services/ai-agent-config.service';
import { ConversationService } from '../../ai-agent/services/conversation.service';
import { AiFlowLogger, createAiTrace } from '../../common/logging/ai-flow-logger';
import {
  isInboundMessageWebhookEvent,
  isNonActionableWebhookEvent,
} from '../../common/utils/whatsapp-presence.util';
import { isExitCommand } from '../../ai-agent/constants/session.constants';
import { ChatGateway } from '../../chat/chat.gateway';


/**
 * Controller que recebe webhooks do Evolution Go.
 */
@Controller('whatsapp/evolution')
export class WhatsAppWebhookController {
  private readonly logger = new Logger('WhatsAppWebhookController');

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistryService,
    private readonly configService: AiAgentConfigService,
    private readonly conversationService: ConversationService,
    @Inject(forwardRef(() => AiOrchestratorService))
    private readonly aiOrchestrator: AiOrchestratorService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Body() body: unknown,
    @Headers('x-webhook-secret') webhookSecretHeader?: string,
    @Query('secret') webhookSecretQuery?: string,
  ) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      this.logger.warn('Webhook received with invalid body');
      return { received: true, processed: false, error: 'Invalid body' };
    }

    const payload = body as Record<string, unknown>;

    const eventName =
      (typeof payload.event === 'string' && payload.event) ||
      (typeof payload.type === 'string' && payload.type) ||
      '';
    const instanceNameFromPayload =
      (typeof payload.instance === 'string' && payload.instance) ||
      (typeof payload.instanceName === 'string' && payload.instanceName) ||
      '';
    const instanceIdFromPayload =
      typeof payload.instanceId === 'string' ? payload.instanceId : '';

    const trace = createAiTrace();

    if (isNonActionableWebhookEvent(eventName)) {
      AiFlowLogger.debug('webhook_non_actionable', {
        traceId: trace.traceId,
        instanceId: instanceIdFromPayload || undefined,
      }, { event: eventName || 'unknown' });
      return { received: true, processed: false };
    }

    if (isInboundMessageWebhookEvent(eventName)) {
      AiFlowLogger.flow('received_webhook', {
        traceId: trace.traceId,
        instanceId: instanceIdFromPayload || undefined,
      }, { event: eventName });
    } else {
      AiFlowLogger.debug('received_webhook', {
        traceId: trace.traceId,
        instanceId: instanceIdFromPayload || undefined,
      }, { event: eventName || 'unknown' });
    }

    const instanceId = instanceIdFromPayload;

    if (!instanceId) {
      const instanceName = instanceNameFromPayload;
      if (!instanceName) {
        AiFlowLogger.ignored('missing_instance_identifier', {
          traceId: trace.traceId,
        });
        this.logger.warn('Webhook received without instance identifier');
        return { received: true, processed: false, error: 'Instance identifier missing' };
      }
      return this.processByInstanceName(
        instanceName,
        payload,
        webhookSecretHeader,
        webhookSecretQuery,
        trace,
      );
    }

    try {
      const instance = await this.prisma.whatsAppInstance.findFirst({
        where: { evolutionInstanceId: instanceId },
      });

      if (!instance) {
        AiFlowLogger.ignored('instance_not_found', {
          traceId: trace.traceId,
          instanceId,
        });
        return { received: true, processed: false, error: 'Instance not found' };
      }

      const tenantId = instance.tenantId;
      trace.tenantId = tenantId;
      trace.instanceId = instanceId;

      AiFlowLogger.flow('tenant_resolved', trace);

      const providedSecret = webhookSecretHeader || webhookSecretQuery;
      if (instance.webhookSecret && instance.webhookSecret !== providedSecret) {
        AiFlowLogger.ignored('invalid_webhook_secret', trace);
        return { received: true, processed: false, error: 'Invalid secret' };
      }

      const provider = this.providerRegistry.getProvider(instance.providerType);
      const event = provider.parseWebhook(payload, tenantId);

      if (!event) {
        if (isInboundMessageWebhookEvent(eventName)) {
          AiFlowLogger.ignored('message_parse_failed', trace, { event: eventName });
        } else {
          AiFlowLogger.debug('event_not_parsed', trace, { event: eventName });
        }
        return { received: true, processed: false };
      }

      if (event.type !== 'message') {
        AiFlowLogger.debug('webhook_non_message_event', trace, {
          event: eventName,
          normalizedType: event.type,
        });
        switch (event.type) {
          case 'connection':
            await this.handleNormalizedConnection(event);
            break;
          case 'ack':
            await this.handleNormalizedAck(event);
            break;
        }
        return { received: true, processed: true };
      }

      await this.handleNormalizedMessage(event, trace);

      AiFlowLogger.flow('webhook_message_flow_complete', trace);
      return { received: true, processed: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      AiFlowLogger.error('webhook_handler', trace, { error: message });
      this.logger.error(`Webhook processing failed: ${message}`);
      return { received: true, processed: false, error: message };
    }
  }

  private async processByInstanceName(
    instanceName: string,
    payload: Record<string, unknown>,
    headerSecret?: string,
    querySecret?: string,
    trace?: ReturnType<typeof createAiTrace>,
  ) {
    const flowTrace = trace ?? createAiTrace();

    const instance = await this.prisma.whatsAppInstance.findFirst({
      where: {
        OR: [
          { instanceName: instanceName },
          { evolutionInstanceId: instanceName },
        ],
      },
    });

    if (!instance) {
      AiFlowLogger.ignored('instance_not_found', flowTrace, { instanceName });
      return { received: true, processed: false, error: 'Instance not found' };
    }

    flowTrace.tenantId = instance.tenantId;
    flowTrace.instanceId = instance.evolutionInstanceId ?? undefined;
    AiFlowLogger.flow('tenant_resolved', flowTrace, { via: 'instanceName' });

    const providedSecret = headerSecret || querySecret;
    if (instance.webhookSecret && instance.webhookSecret !== providedSecret) {
      AiFlowLogger.ignored('invalid_webhook_secret', flowTrace);
      return { received: true, processed: false, error: 'Invalid secret' };
    }

    const provider = this.providerRegistry.getProvider(instance.providerType);
    const event = provider.parseWebhook(payload, instance.tenantId);
    if (!event || event.type !== 'message') {
      AiFlowLogger.debug('event_not_parsed_or_not_message', flowTrace);
      return { received: true, processed: false };
    }

    await this.handleNormalizedMessage(event, flowTrace);
    return { received: true, processed: true };
  }

  private async handleNormalizedMessage(
    event: WhatsAppWebhookEvent,
    trace: ReturnType<typeof createAiTrace>,
  ) {
    const { tenantId, from: phone, content, messageType, externalId, chatJid, pushName, isFromMe } = event;
    trace.tenantId = tenantId;
    trace.phone = phone;
    trace.chatJid = chatJid;
    if (externalId) trace.messageId = externalId;

    this.logger.log(`[WA_WEBHOOK] received traceId=${trace.traceId} tenantId=${tenantId}`);
    this.logger.log(`[WA_WEBHOOK] message_event fromMe=${isFromMe} externalId=${externalId} contentPreview=${content?.substring(0, 20)}`);

    AiFlowLogger.flow('handle_message_start', trace, {
      hasChatJid: Boolean(chatJid),
      textLength: content?.length ?? 0,
      pushName: pushName || 'none',
    });

    if (!phone || !content) {
      AiFlowLogger.ignored('missing_phone_or_content', trace, {
        hasPhone: Boolean(phone),
        hasContent: Boolean(content),
      });
      return;
    }

    if (externalId) {
      const existing = await this.prisma.chatMessage.findUnique({
        where: { externalId },
      });
      if (existing) {
        this.logger.log(`[WA_WEBHOOK] duplicate_found updating externalId=${externalId} sessionId=${existing.sessionId}`);
        await this.prisma.chatMessage.update({
          where: { id: existing.id },
          data: { externalStatus: 'sent' } // Atualiza o status
        });
        AiFlowLogger.ignored('duplicate_message_id_updated', trace, {
          sessionId: existing.sessionId,
        });
        return;
      }
    } else {
      AiFlowLogger.flow('dedup_skipped_no_external_id', trace);
    }

    AiFlowLogger.flow('message_persist_start', trace);

    try {
      // Resolve or update Customer with pushName if available
      let customerId: string | undefined;
      let currentCustomer: { id: string; profilePictureUrl: string | null; profilePictureUpdatedAt: Date | null } | null = null;
      if (pushName && pushName.trim()) {
        currentCustomer = await this.prisma.customer.upsert({
          where: {
            tenantId_phone: { tenantId, phone },
          },
          create: {
            tenantId,
            phone,
            name: pushName.trim(),
          },
          update: {
            name: pushName.trim(),
          },
          select: { id: true, profilePictureUrl: true, profilePictureUpdatedAt: true },
        });
        customerId = currentCustomer.id;
        AiFlowLogger.flow('contact_resolved', trace, {
          source: 'pushName',
          customerId,
        });
      } else {
        // Try to find existing customer
        currentCustomer = await this.prisma.customer.findUnique({
          where: {
            tenantId_phone: { tenantId, phone },
          },
          select: { id: true, name: true, profilePictureUrl: true, profilePictureUpdatedAt: true },
        });
        if (currentCustomer) {
          customerId = currentCustomer.id;
          AiFlowLogger.flow('contact_resolved', trace, {
            source: 'existing_customer',
            customerId,
          });
        }
      }

      if (currentCustomer) {
        const now = new Date();
        const lastUpdated = currentCustomer.profilePictureUpdatedAt;
        if (!currentCustomer.profilePictureUrl || !lastUpdated || (now.getTime() - lastUpdated.getTime() > 24 * 60 * 60 * 1000)) {
          this.refreshCustomerProfilePicture(tenantId, phone, currentCustomer.id);
        }
      }

      // Resolve displayName for session: Customer.name > pushName > phone
      let displayName: string | undefined;
      if (customerId) {
        const customer = await this.prisma.customer.findUnique({
          where: { id: customerId },
          select: { name: true },
        });
        displayName = customer?.name;
      }
      if (!displayName && pushName) {
        displayName = pushName.trim();
      }

      const config = await this.configService.getEffectiveAiAgentConfig(tenantId);
      const session = await this.conversationService.getOrCreateSession(tenantId, phone, {
        customerId,
        displayName,
        remoteJid: chatJid,
        sessionTimeoutMin: config.sessionTimeoutMin,
      });
      
      this.logger.log(`[WA_WEBHOOK] session_resolved sessionId=${session.id}`);

      const updateSessionData: Record<string, unknown> = {
        customerId: customerId || undefined,
        displayName: displayName || undefined,
        remoteJid: chatJid,
        closedAt: null,
      };

      if (isFromMe) {
        updateSessionData.lastMessageAt = new Date();
        const dbConfig = await this.prisma.aiAgentConfig.findUnique({
          where: { tenantId },
          select: { humanInterventionEnabled: true, humanInterventionMinutes: true },
        });

        if (dbConfig?.humanInterventionEnabled) {
          updateSessionData.handoffActive = true;
          updateSessionData.handoffOperator = 'human';
          updateSessionData.handoffReason = 'Intervenção humana via WhatsApp (aparelho)';
          updateSessionData.handoffAt = new Date();
          const until = new Date();
          until.setMinutes(until.getMinutes() + (dbConfig.humanInterventionMinutes || 15));
          updateSessionData.handoffUntil = until;
        }
      } else {
        updateSessionData.unreadCount = { increment: 1 };
        updateSessionData.lastMessageAt = new Date(); // Reset expiration timer for customer messages
      }

      await this.prisma.chatSession.update({
        where: { id: session.id },
        data: updateSessionData,
      });

      try {
        await this.prisma.chatMessage.create({
          data: {
            sessionId: session.id,
            direction: isFromMe ? 'outbound' : 'inbound',
            senderType: isFromMe ? 'human' : 'customer',
            content,
            messageType: messageType || 'text',
            externalId: externalId || undefined,
            externalStatus: isFromMe ? 'sent' : 'delivered',
            timestamp: new Date(),
          },
        });
      } catch (err: unknown) {
        // Se duas requisições simultâneas tentarem criar o mesmo externalId, apenas ignorar a duplicata.
        const msg = err instanceof Error ? err.message : 'Unknown error';
        if (msg.toLowerCase().includes('unique') && externalId) {
          this.logger.log(`[WA_WEBHOOK] duplicate_skipped (race condition) externalId=${externalId}`);
          AiFlowLogger.ignored('duplicate_message_id_race', trace, { sessionId: session.id });
          return;
        }
        throw err;
      }
      
      this.logger.log(`[WA_WEBHOOK] message_persist_success sessionId=${session.id} externalId=${externalId}`);

      AiFlowLogger.flow('message_persist_success', trace, {
        sessionId: session.id,
        messageType: messageType || 'text',
        textLength: content.length,
        senderType: 'customer',
      });

      // Emite evento de socket para atualizar o Inbox em tempo real
      try {
        const savedMessages = await this.prisma.chatMessage.findMany({
          where: { sessionId: session.id },
          orderBy: { createdAt: 'desc' },
          take: 1,
        });
        const lastMessage = savedMessages[0];
        if (lastMessage) {
          ChatGateway.instance?.emitMessageCreated(tenantId, session.id, lastMessage);
          this.logger.log(`[WA_WEBHOOK] socket_emit_success event=messageCreated sessionId=${session.id}`);
        }
        // Atualiza contadores e lista lateral
        const updatedSession = await this.prisma.chatSession.findUnique({ where: { id: session.id } });
        if (updatedSession) {
          ChatGateway.instance?.emitSessionUpdated(tenantId, updatedSession);
          this.logger.log(`[WA_WEBHOOK] socket_emit_success event=sessionUpdated sessionId=${session.id}`);
        }
      } catch (emitErr) {
        this.logger.error(`[WA_WEBHOOK] error stage=socket_emit message=${emitErr instanceof Error ? emitErr.message : 'unknown'}`);
      }

      // [AI_GUARD] Check handoffActive state immediately before dispatching to AI
      const freshSession = await this.prisma.chatSession.findUnique({ where: { id: session.id }, select: { handoffActive: true } });
      const isHandoffActive = freshSession?.handoffActive ?? session.handoffActive;

      if (isHandoffActive || isFromMe) {
        this.logger.log(`[AI_GUARD] Ignoring message dispatch for sessionId=${session.id} (handoffActive=${isHandoffActive}, isFromMe=${isFromMe})`);
        AiFlowLogger.ignored('human_handoff', trace, { sessionId: session.id, isFromMe });
        return;
      }

      // Detecta comando de saída do cliente (ex: #Sair, sair, encerrar)
      if (config.closeOnExitCommand && isExitCommand(content, config.exitCommands)) {
        AiFlowLogger.flow('exit_command_detected', trace, {
          sessionId: session.id,
          command: content.trim(),
        });

        try {
          await this.conversationService.closeSessionByCustomerExit(session.id, content.trim());
          return;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          AiFlowLogger.error('exit_command_close_session', trace, { error: msg });
          this.logger.error(`Failed to close session by customer exit: ${msg}`);
          return;
        }
      }

      AiFlowLogger.flow('orchestrator_dispatch_start', trace);

      void this.aiOrchestrator
        .handleInboundMessage(tenantId, session.id, phone, content, trace, chatJid)
        .then(() => {
          AiFlowLogger.flow('orchestrator_dispatch_done', trace);
        })
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : 'Unknown error';
          AiFlowLogger.error('orchestrator_dispatch', trace, { error: msg });
          this.logger.error(`AI Orchestrator failed for ${phone}: ${msg}`);
        });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      AiFlowLogger.error('message_persist', trace, { error: msg });
      throw error;
    }
  }

  private async handleNormalizedConnection(event: WhatsAppWebhookEvent) {
    const { tenantId, state, phoneNumber } = event;
    if (!state) return;

    const instance = await this.prisma.whatsAppInstance.findUnique({
      where: { tenantId },
    });

    if (instance) {
      await this.prisma.whatsAppInstance.update({
        where: { id: instance.id },
        data: {
          status: state as WhatsAppInstanceStatus,
          phoneNumber: phoneNumber || instance.phoneNumber,
        },
      });
      this.logger.debug(`Connection updated for ${tenantId}: ${state}`);
    }
  }

  private async handleNormalizedAck(event: WhatsAppWebhookEvent) {
    this.logger.debug(`ACK received for ${event.externalId}: ${event.status}`);
  }

  private refreshCustomerProfilePicture(tenantId: string, phone: string, customerId: string) {
    // Fire and forget
    void (async () => {
      try {
        const instance = await this.prisma.whatsAppInstance.findUnique({
          where: { tenantId },
          select: { providerType: true, apiUrl: true, apiKey: true, evolutionInstanceId: true },
        });
        if (!instance || !instance.apiUrl || !instance.apiKey || !instance.evolutionInstanceId) return;

        const provider = this.providerRegistry.getProvider(instance.providerType);
        if (typeof provider.getProfilePictureUrl !== 'function') return;

        const url = await provider.getProfilePictureUrl(instance.apiUrl, instance.apiKey, instance.evolutionInstanceId, phone);
        if (url) {
          await this.prisma.customer.update({
            where: { id: customerId },
            data: { profilePictureUrl: url, profilePictureUpdatedAt: new Date() },
          });
        } else {
          // Atualiza a data para não tentar na próxima mensagem
          await this.prisma.customer.update({
            where: { id: customerId },
            data: { profilePictureUpdatedAt: new Date() },
          });
        }
      } catch (err) {
        this.logger.debug(`Erro background ao atualizar foto de perfil do customer ${customerId}`);
      }
    })();
  }
}
