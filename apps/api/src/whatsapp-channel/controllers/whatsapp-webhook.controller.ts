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
import { AiFlowLogger, createAiTrace } from '../../common/logging/ai-flow-logger';
import {
  isInboundMessageWebhookEvent,
  isNonActionableWebhookEvent,
} from '../../common/utils/whatsapp-presence.util';


/**
 * Controller que recebe webhooks do Evolution Go.
 */
@Controller('whatsapp/evolution')
export class WhatsAppWebhookController {
  private readonly logger = new Logger('WhatsAppWebhookController');

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerRegistry: WhatsAppProviderRegistryService,
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
    const { tenantId, from: phone, content, messageType, externalId, chatJid, pushName } = event;
    trace.tenantId = tenantId;
    trace.phone = phone;
    trace.chatJid = chatJid;
    if (externalId) trace.messageId = externalId;

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
        AiFlowLogger.ignored('duplicate_message_id', trace, {
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
      if (pushName && pushName.trim()) {
        const customer = await this.prisma.customer.upsert({
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
          select: { id: true },
        });
        customerId = customer.id;
        AiFlowLogger.flow('contact_resolved', trace, {
          source: 'pushName',
          customerId,
        });
      } else {
        // Try to find existing customer
        const existingCustomer = await this.prisma.customer.findUnique({
          where: {
            tenantId_phone: { tenantId, phone },
          },
          select: { id: true, name: true },
        });
        if (existingCustomer) {
          customerId = existingCustomer.id;
          AiFlowLogger.flow('contact_resolved', trace, {
            source: 'existing_customer',
            customerId,
          });
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

      const session = await this.prisma.chatSession.upsert({
        where: {
          tenantId_customerPhone: { tenantId, customerPhone: phone },
        },
        create: {
          tenantId,
          customerPhone: phone,
          customerId,
          displayName,
          channel: 'whatsapp',
          remoteJid: chatJid,
          state: 'greeting',
          lastMessageAt: new Date(),
        },
        update: {
          customerId: customerId || undefined,
          displayName: displayName || undefined,
          remoteJid: chatJid,
          lastMessageAt: new Date(),
          closedAt: null,
          unreadCount: { increment: 1 },
        },
      });

      try {
        await this.prisma.chatMessage.create({
          data: {
            sessionId: session.id,
            direction: 'inbound',
            senderType: 'customer',
            content,
            messageType: messageType || 'text',
            externalId: externalId || undefined,
            externalStatus: 'delivered',
            timestamp: new Date(),
          },
        });
      } catch (err: unknown) {
        // Se duas requisições simultâneas tentarem criar o mesmo externalId, apenas ignorar a duplicata.
        const msg = err instanceof Error ? err.message : 'Unknown error';
        if (msg.toLowerCase().includes('unique') && externalId) {
          AiFlowLogger.ignored('duplicate_message_id_race', trace, { sessionId: session.id });
          return;
        }
        throw err;
      }

      AiFlowLogger.flow('message_persist_success', trace, {
        sessionId: session.id,
        messageType: messageType || 'text',
        textLength: content.length,
        senderType: 'customer',
      });

      if (session.handoffActive) {
        AiFlowLogger.ignored('human_handoff', trace, { sessionId: session.id });
        return;
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
}
