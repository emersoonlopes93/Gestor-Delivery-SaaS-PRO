import type { NotificationEvent } from '../../../notifications/notificationEvents';
import { getSoundStorageKey } from '../../../notifications/useSoundManager';

export const VOICE_ALERTS_STORAGE_KEY = 'orderManagerVoiceAlertsEnabled';
export const VOICE_ALERTS_CHANGED_EVENT = 'order-manager:voice-alerts-changed';

export type SpeechProvider = { speak: (phrase: string) => Promise<void> | void };
type QueuedAlert = { phrase: string; priority: number; createdAt: number };

export type OperationalAlertForAnnouncement = {
  ruleKey: string;
  acknowledgedAt: string | null;
  severity: 'INFO' | 'ATTENTION' | 'CRITICAL';
};

export const WAITING_ACCEPTANCE_RULE_KEY = 'ORDER_WAITING_ACTION';
export const MARKETPLACE_COURIER_ARRIVED_RULE_KEY = 'MARKETPLACE_COURIER_ARRIVED';

/** Acknowledgement is informational for a pending acceptance, never a resolution. */
export function shouldAnnounceOperationalAlert(alert: OperationalAlertForAnnouncement): boolean {
  return alert.severity !== 'INFO'
    && (!alert.acknowledgedAt || alert.ruleKey === WAITING_ACCEPTANCE_RULE_KEY || alert.ruleKey === MARKETPLACE_COURIER_ARRIVED_RULE_KEY);
}

export function getOperationalAlertRepeatIntervalMs(alert: OperationalAlertForAnnouncement): number {
  return alert.ruleKey === WAITING_ACCEPTANCE_RULE_KEY || alert.ruleKey === MARKETPLACE_COURIER_ARRIVED_RULE_KEY || alert.severity === 'CRITICAL'
    ? 30_000
    : 60_000;
}

const PRIORITY: Record<NotificationEvent['priority'], number> = { low: 1, medium: 2, high: 3, critical: 4 };

/**
 * A UI-local coordinator. It receives already deduped, leader-owned events from the existing
 * notification layer; it never opens sockets and it intentionally never speaks customer data.
 */
export class OrderAlertCoordinator {
  private playing = false;
  private queue: QueuedAlert[] = [];
  private readonly seen = new Map<string, number>();

  enqueue(
    event: Pick<NotificationEvent, 'type' | 'priority' | 'createdAt'> & Partial<Pick<NotificationEvent, 'id' | 'title' | 'orderId'>>,
    provider: SpeechProvider,
  ): void {
    const timestamp = new Date(event.createdAt).getTime();
    const safeCreatedAt = Number.isFinite(timestamp) ? timestamp : Date.now();
    this.prune(safeCreatedAt);
    const eventId = event.id ?? `${event.type}:${event.title ?? event.orderId ?? safeCreatedAt}`;
    if (this.seen.has(eventId)) return;
    this.seen.set(eventId, safeCreatedAt);
    const rawDisplayNumber = getOperationalDisplayNumber(event.title ?? '');
    const displayNumber = rawDisplayNumber ? normalizeOrderNumberForSpeech(rawDisplayNumber) : null;
    const courierPhrase = event.type === 'order.alert' && /entregador da 99food chegou/i.test(event.title ?? '')
      ? displayNumber ? `Entregador da 99Food chegou para o pedido ${displayNumber}.` : 'O entregador da 99Food chegou.'
      : null;
    const phrase = courierPhrase ?? (event.type === 'order.created'
      ? displayNumber ? `Novo pedido ${displayNumber} recebido.` : 'Novo pedido recebido.'
      : event.type === 'order.ready'
        ? displayNumber ? `Pedido ${displayNumber} pronto para a próxima etapa.` : 'Pedido pronto para a próxima etapa.'
        : event.type === 'order.cancelled'
          ? displayNumber ? `Pedido ${displayNumber} cancelado.` : 'Um pedido foi cancelado.'
          : event.type === 'order.alert' && /aguardando ação/i.test(event.title ?? '')
            ? displayNumber ? `Pedido ${displayNumber} aguarda aceite.` : 'Um pedido aguarda aceite.'
            : 'Atualização operacional disponível.');
    this.queue.push({ phrase, priority: PRIORITY[event.priority], createdAt: safeCreatedAt });
    this.queue.sort((left, right) => right.priority - left.priority || left.createdAt - right.createdAt);
    if (!this.playing) void this.flush(provider);
  }

  private async flush(provider: SpeechProvider): Promise<void> {
    this.playing = true;
    while (this.queue.length > 0) await provider.speak((this.queue.shift() as QueuedAlert).phrase);
    this.playing = false;
  }

  private prune(now: number): void {
    for (const [eventId, seenAt] of this.seen) {
      if (now - seenAt > 60_000) this.seen.delete(eventId);
    }
  }
}

/** Reads only a human-facing display token; a UUID/orderId is never speech input. */
export function getOperationalDisplayNumber(title: string): string | null {
  const match = title.match(/#(\d{1,12})\b/);
  return match ? `#${match[1]}` : null;
}

/** Normalizes only a safely numeric display value; storage, UI and print values remain untouched. */
export function normalizeOrderNumberForSpeech(displayNumber: string): string {
  const numeric = displayNumber.match(/^(?:#+)?(\d{1,12})$/)?.[1];
  if (!numeric) return displayNumber;
  return String(Number.parseInt(numeric, 10));
}

export function browserSpeechProvider(): SpeechProvider | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  return { speak: (phrase) => new Promise<void>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.lang = 'pt-BR';
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  }) };
}

export function isVoiceAlertsEnabled(scopeKey?: string): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(getSoundStorageKey(VOICE_ALERTS_STORAGE_KEY, scopeKey)) === 'true';
}

export function setVoiceAlertsEnabled(enabled: boolean, scopeKey?: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(getSoundStorageKey(VOICE_ALERTS_STORAGE_KEY, scopeKey), String(enabled));
  window.dispatchEvent(new CustomEvent(VOICE_ALERTS_CHANGED_EVENT));
}

export const sharedOrderAlertCoordinator = new OrderAlertCoordinator();
export const ORDER_ALERT_CENTER_TOGGLE_EVENT = 'gestor:order-alert-center:toggle';
