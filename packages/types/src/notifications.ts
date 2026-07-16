export type NotificationChannel = 'push' | 'whatsapp' | 'email' | 'sms' | 'internal';
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'read';

export interface PushSubscriptionPayload {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface NotificationDTO {
  id: string;
  tenantId: string;
  userId?: string | null;
  userType?: string | null;
  channel: NotificationChannel;
  title: string;
  body: string;
  data?: Record<string, unknown> | null;
  status: NotificationStatus;
  error?: string | null;
  sentAt?: Date | string | null;
  readAt?: Date | string | null;
  createdAt: Date | string;
}

export interface NotificationSentEvent {
  tenantId: string;
  notificationId: string;
  channel: NotificationChannel;
  status: 'sent' | 'failed';
  sentAt: string;
}

export const NOTIFICATION_DOMAIN_EVENTS = [
  'order.created',
  'order.confirmed',
  'order.auto_accepted',
  'order.cancelled',
  'order.sent_to_kitchen',
  'order.ready',
  'order.out_for_delivery',
  'order.delivered',
  'order.failed',
  'store.opened',
  'store.closed',
  'store.paused',
  'store.resumed',
  'whatsapp.message_received',
  'whatsapp.handoff',
] as const;

export const NOTIFICATION_TECHNICAL_EVENTS = [
  'connection.lost',
  'connection.restored',
] as const;

export const NOTIFICATION_SYSTEM_EVENTS = [
  'print.completed',
  'print.failed',
  'system.error',
] as const;

export const NOTIFICATION_CANONICAL_EVENTS = [
  ...NOTIFICATION_DOMAIN_EVENTS,
  ...NOTIFICATION_TECHNICAL_EVENTS,
  ...NOTIFICATION_SYSTEM_EVENTS,
] as const;

export type NotificationDomainEvent = typeof NOTIFICATION_DOMAIN_EVENTS[number];
export type NotificationTechnicalEvent = typeof NOTIFICATION_TECHNICAL_EVENTS[number];
export type NotificationSystemEvent = typeof NOTIFICATION_SYSTEM_EVENTS[number];
export type NotificationCanonicalEvent = typeof NOTIFICATION_CANONICAL_EVENTS[number];

export type NotificationLegacyEvent =
  | 'order.new'
  | 'order.accepted'
  | 'order.kds_ready'
  | 'error.critical';

export const NOTIFICATION_LEGACY_ALIASES: Record<NotificationLegacyEvent, NotificationCanonicalEvent> = {
  'order.new': 'order.created',
  'order.accepted': 'order.confirmed',
  'order.kds_ready': 'order.ready',
  'error.critical': 'system.error',
} as const;

export type TenantNotificationEventPayload = {
  type: NotificationCanonicalEvent;
  orderId?: string;
  orderNumber?: string;
  customerName?: string;
  total?: number | string;
  fulfillmentType?: string;
  sessionId?: string;
  sessionName?: string;
  timestamp: string;
};

export function isNotificationCanonicalEvent(value: string): value is NotificationCanonicalEvent {
  return (NOTIFICATION_CANONICAL_EVENTS as readonly string[]).includes(value);
}

export function isNotificationLegacyEvent(value: string): value is NotificationLegacyEvent {
  return Object.prototype.hasOwnProperty.call(NOTIFICATION_LEGACY_ALIASES, value);
}

export function normalizeNotificationEvent(value: NotificationCanonicalEvent | NotificationLegacyEvent): NotificationCanonicalEvent {
  if (isNotificationLegacyEvent(value)) {
    return NOTIFICATION_LEGACY_ALIASES[value];
  }
  return value;
}

// ============================================================
// Push Notification Queue
// ============================================================

export const NOTIFICATIONS_PUSH_QUEUE = 'notifications-push';

export type PushNotificationJobType =
  | 'send-to-recipient'
  | 'send-to-tenant-broadcast';

export interface PushNotificationJob {
  type: PushNotificationJobType;
  tenantId: string;
  recipientType: 'driver' | 'tenant_user';
  recipientId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  icon?: string;
  tag?: string;
  url?: string;
  /** ID de idempotência para evitar envios duplicados */
  idempotencyKey?: string;
}
