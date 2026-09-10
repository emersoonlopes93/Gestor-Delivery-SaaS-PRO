import type { NotificationEvent } from '../../../notifications/notificationEvents';
import { getSoundStorageKey } from '../../../notifications/useSoundManager';

export const VOICE_ALERTS_STORAGE_KEY = 'orderManagerVoiceAlertsEnabled';
export const VOICE_ALERTS_CHANGED_EVENT = 'order-manager:voice-alerts-changed';

export type SpeechProvider = { speak: (phrase: string) => Promise<void> | void };
type QueuedAlert = { phrase: string; priority: number; createdAt: number };

const PRIORITY: Record<NotificationEvent['priority'], number> = { low: 1, medium: 2, high: 3, critical: 4 };

/**
 * A UI-local coordinator. It receives already deduped, leader-owned events from the existing
 * notification layer; it never opens sockets and it intentionally never speaks customer data.
 */
export class OrderAlertCoordinator {
  private playing = false;
  private queue: QueuedAlert[] = [];

  enqueue(event: Pick<NotificationEvent, 'type' | 'orderId' | 'priority' | 'createdAt'>, provider: SpeechProvider): void {
    const phrase = event.type === 'order.created'
      ? `Novo pedido ${event.orderId ? 'recebido' : 'recebido na operação'}.`
      : event.type === 'order.ready'
        ? 'Pedido pronto para a próxima etapa.'
        : event.type === 'order.cancelled'
          ? 'Um pedido foi cancelado.'
          : 'Atualização operacional disponível.';
    this.queue.push({ phrase, priority: PRIORITY[event.priority], createdAt: new Date(event.createdAt).getTime() });
    this.queue.sort((left, right) => right.priority - left.priority || left.createdAt - right.createdAt);
    if (!this.playing) void this.flush(provider);
  }

  private async flush(provider: SpeechProvider): Promise<void> {
    this.playing = true;
    while (this.queue.length > 0) await provider.speak((this.queue.shift() as QueuedAlert).phrase);
    this.playing = false;
  }
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
