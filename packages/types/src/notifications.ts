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
