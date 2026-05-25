import { normalizeWhatsAppSendNumber } from './whatsapp-number.util';

/** Eventos Evolution-Go que não disparam resposta da IA */
/** Eventos que não devem acionar IA nem poluir logs em nível info */
const NON_ACTIONABLE_EVENTS = new Set(['receipt', 'chatpresence']);

export function isNonActionableWebhookEvent(eventName: string): boolean {
  return NON_ACTIONABLE_EVENTS.has(eventName.trim().toLowerCase());
}

export function isInboundMessageWebhookEvent(eventName: string): boolean {
  return eventName.trim().toLowerCase() === 'message';
}

/**
 * Destino para /message/presence — prefere JID do chat (Info.Chat).
 */
export function resolveWhatsAppPresenceTarget(
  chatJid?: string,
  phone?: string,
): string {
  const chat = chatJid?.trim();
  if (chat && chat.includes('@')) {
    return chat;
  }
  return normalizeWhatsAppSendNumber(phone ?? chat ?? '');
}

export function getTypingDelayMs(): number {
  const min = Number(process.env.AI_TYPING_MIN_DELAY_MS ?? 1500);
  const max = Number(process.env.AI_TYPING_MAX_DELAY_MS ?? 5000);
  const safeMin = Number.isFinite(min) && min >= 0 ? min : 1500;
  const safeMax = Number.isFinite(max) && max >= safeMin ? max : 5000;
  return Math.min(safeMax, Math.max(safeMin, safeMin));
}

export function summarizeHttpBody(data: unknown, maxLen = 200): string {
  if (data === null || data === undefined) return '';
  try {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    return str.length > maxLen ? `${str.slice(0, maxLen)}...` : str;
  } catch {
    return '<unserializable>';
  }
}
