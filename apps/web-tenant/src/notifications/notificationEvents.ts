import type { NotificationCanonicalEvent, NotificationLegacyEvent } from '../../../../packages/types/src/notifications';
import { normalizeNotificationEvent } from '../../../../packages/types/src/notifications';
import type { SoundPriority } from './soundCatalog';

export type NotificationEventType = NotificationCanonicalEvent;
export type NotificationEventInputType = NotificationCanonicalEvent | NotificationLegacyEvent;

export type NotificationEvent = {
  id: string;
  type: NotificationEventType;
  orderId?: string;
  title: string;
  message?: string;
  priority: SoundPriority;
  createdAt: string;
  source: 'socket' | 'polling' | 'local' | 'connection' | 'system';
};

const NOTIFICATION_EVENT_NAME = 'tenant:notification-event';

function extractOrderReference(event: NotificationEvent) {
  if (event.orderId) {
    return event.orderId;
  }

  if (!event.type.startsWith('order.')) {
    return null;
  }

  const match = event.title.match(/#\d+/);
  return match?.[0] ?? null;
}

function getEventTarget() {
  if (typeof window !== 'undefined') {
    return window;
  }
  return new EventTarget();
}

export function buildNotificationEventId(
  type: NotificationEventInputType,
  source: NotificationEvent['source'],
  orderId?: string,
) {
  const suffix = orderId ? `:${orderId}` : '';
  return `${source}:${normalizeNotificationEvent(type)}${suffix}:${Date.now()}`;
}

export function createNotificationEvent(
  input: Omit<NotificationEvent, 'id' | 'createdAt' | 'type'> & {
    id?: string;
    createdAt?: string;
    type: NotificationEventInputType;
  },
): NotificationEvent {
  const type = normalizeNotificationEvent(input.type);

  return {
    ...input,
    type,
    id: input.id ?? buildNotificationEventId(type, input.source, input.orderId),
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function emitNotificationEvent(event: NotificationEvent) {
  getEventTarget().dispatchEvent(
    new CustomEvent<NotificationEvent>(NOTIFICATION_EVENT_NAME, { detail: event }),
  );
}

export function subscribeNotificationEvents(listener: (event: NotificationEvent) => void) {
  const target = getEventTarget();
  const handler = (rawEvent: Event) => {
    const customEvent = rawEvent as CustomEvent<NotificationEvent>;
    if (customEvent.detail) {
      listener(customEvent.detail);
    }
  };

  target.addEventListener(NOTIFICATION_EVENT_NAME, handler as EventListener);
  return () => {
    target.removeEventListener(NOTIFICATION_EVENT_NAME, handler as EventListener);
  };
}

export class NotificationDeduper {
  private readonly seenIds = new Map<string, number>();
  private readonly seenOrderTypes = new Map<string, number>();

  constructor(
    private readonly eventTtlMs = 60_000,
    private readonly orderTypeTtlMs = 20_000,
  ) {}

  shouldProcess(event: NotificationEvent, now = Date.now()) {
    this.prune(now);

    if (this.seenIds.has(event.id)) {
      return false;
    }

    const orderReference = extractOrderReference(event);
    if (orderReference) {
      const orderTypeKey = `${orderReference}:${event.type}`;
      if (this.seenOrderTypes.has(orderTypeKey)) {
        this.seenIds.set(event.id, now);
        return false;
      }
      this.seenOrderTypes.set(orderTypeKey, now);
    }

    this.seenIds.set(event.id, now);
    return true;
  }

  private prune(now: number) {
    for (const [id, timestamp] of this.seenIds.entries()) {
      if (now - timestamp > this.eventTtlMs) {
        this.seenIds.delete(id);
      }
    }

    for (const [key, timestamp] of this.seenOrderTypes.entries()) {
      if (now - timestamp > this.orderTypeTtlMs) {
        this.seenOrderTypes.delete(key);
      }
    }
  }
}
