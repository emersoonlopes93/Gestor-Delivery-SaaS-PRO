export type NotificationE2ETraceEntry = {
  stage: string;
  eventType?: string;
  eventId?: string;
  tenantId?: string;
  orderId?: string;
  sourceEventName?: string;
  source?: string;
  accepted?: boolean;
  reason?: string;
  isLeader?: boolean;
  tabId?: string;
  lockStrategy?: string;
  soundPreferenceEnabled?: boolean;
  effectiveVolume?: number;
  audioContextState?: string;
  playbackRequested?: boolean;
};

declare global {
  interface Window {
    __notificationE2ETrace?: NotificationE2ETraceEntry[];
  }
}

export function traceNotificationE2E(entry: NotificationE2ETraceEntry): void {
  if (typeof window === 'undefined' || !Array.isArray(window.__notificationE2ETrace)) return;
  window.__notificationE2ETrace.push(entry);
}
