import { randomUUID } from 'crypto';
import { Logger } from '@nestjs/common';

export interface AiFlowContext {
  traceId?: string;
  messageId?: string;
  tenantId?: string;
  instanceId?: string;
  remoteJid?: string;
  sender?: string;
  phone?: string;
}

type FlowFieldValue = string | number | boolean | undefined;

/**
 * Logger estruturado para rastrear o fluxo pós-webhook até envio WhatsApp/LLM.
 * Prefixo: [AI_FLOW] / [AI_FLOW_ERROR] / [AI_CONFIG]
 */
export class AiFlowLogger {
  private static readonly logger = new Logger('AI_FLOW');

  static flow(step: string, ctx: AiFlowContext, extra?: Record<string, FlowFieldValue>): void {
    this.logger.log(this.format('[AI_FLOW]', step, ctx, extra));
  }

  static ignored(reason: string, ctx: AiFlowContext, extra?: Record<string, FlowFieldValue>): void {
    this.logger.log(this.format('[AI_FLOW]', `ignored reason=${reason}`, ctx, extra));
  }

  static error(
    step: string,
    ctx: AiFlowContext,
    extra?: Record<string, FlowFieldValue>,
  ): void {
    this.logger.error(this.format('[AI_FLOW_ERROR]', `step=${step}`, ctx, extra));
  }

  static warn(
    step: string,
    ctx: AiFlowContext,
    extra?: Record<string, FlowFieldValue>,
  ): void {
    this.logger.warn(this.format('[AI_FLOW_WARN]', step, ctx, extra));
  }

  static config(message: string, extra?: Record<string, FlowFieldValue>): void {
    const parts = ['[AI_CONFIG]', message];
    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        if (value !== undefined) parts.push(`${key}=${String(value)}`);
      }
    }
    this.logger.log(parts.join(' '));
  }

  static queue(step: string, extra?: Record<string, FlowFieldValue>): void {
    const parts = ['[AI_QUEUE]', step];
    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        if (value !== undefined) parts.push(`${key}=${String(value)}`);
      }
    }
    this.logger.log(parts.join(' '));
  }

  private static format(
    prefix: string,
    step: string,
    ctx: AiFlowContext,
    extra?: Record<string, FlowFieldValue>,
  ): string {
    const fields: string[] = [prefix, step];

    if (ctx.messageId) fields.push(`messageId=${ctx.messageId}`);
    if (ctx.traceId && ctx.traceId !== ctx.messageId) {
      fields.push(`traceId=${ctx.traceId}`);
    }
    if (ctx.tenantId) fields.push(`tenantId=${ctx.tenantId}`);
    if (ctx.instanceId) fields.push(`instanceId=${ctx.instanceId}`);
    if (ctx.remoteJid) fields.push(`remoteJid=${ctx.remoteJid}`);
    if (ctx.sender) fields.push(`sender=${ctx.sender}`);
    if (ctx.phone) fields.push(`phone=${ctx.phone}`);

    if (extra) {
      for (const [key, value] of Object.entries(extra)) {
        if (value !== undefined) fields.push(`${key}=${String(value)}`);
      }
    }

    return fields.join(' ');
  }
}

export function createAiTrace(messageId?: string): AiFlowContext {
  const id = messageId?.trim() || randomUUID();
  return { traceId: id, messageId: messageId?.trim() || undefined };
}
