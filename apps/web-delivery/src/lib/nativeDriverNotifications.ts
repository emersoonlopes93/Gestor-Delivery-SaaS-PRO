import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { DriverDeliveryEvent } from '@gestor/types';

export const DRIVER_DELIVERIES_CHANNEL_ID = 'driver-deliveries-v1';

export interface NativeNotificationStatus {
  isNative: boolean;
  localNotifications: 'granted' | 'denied' | 'prompt' | 'unavailable';
  nativePush: 'not_configured' | 'unavailable';
}

function isLocalNotificationsAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('LocalNotifications');
}

function nativePushStatus(): NativeNotificationStatus['nativePush'] {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('PushNotifications')) {
    return 'unavailable';
  }
  return 'not_configured';
}

async function ensureDriverChannel() {
  if (Capacitor.getPlatform() !== 'android') return;
  await LocalNotifications.createChannel({
    id: DRIVER_DELIVERIES_CHANNEL_ID,
    name: 'Entregas',
    description: 'Alertas locais de novas entregas',
    importance: 5,
    visibility: 1,
    vibration: true,
    lights: true,
    lightColor: '#f97316',
  });
}

export async function getNativeNotificationStatus(): Promise<NativeNotificationStatus> {
  const isNative = Capacitor.isNativePlatform();
  if (!isLocalNotificationsAvailable()) {
    return { isNative, localNotifications: 'unavailable', nativePush: nativePushStatus() };
  }
  const permission = await LocalNotifications.checkPermissions();
  return {
    isNative,
    localNotifications: permission.display === 'granted'
      ? 'granted'
      : permission.display === 'denied' ? 'denied' : 'prompt',
    nativePush: nativePushStatus(),
  };
}

export async function requestNativeLocalNotifications(): Promise<NativeNotificationStatus> {
  if (!isLocalNotificationsAvailable()) return getNativeNotificationStatus();
  const current = await LocalNotifications.checkPermissions();
  const result = current.display === 'granted'
    ? current
    : await LocalNotifications.requestPermissions();
  if (result.display === 'granted') await ensureDriverChannel();
  return getNativeNotificationStatus();
}

function notificationId(eventId: string) {
  let hash = 0;
  for (let index = 0; index < eventId.length; index += 1) {
    hash = ((hash << 5) - hash) + eventId.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash) || 1;
}

export async function showNativeAssignmentNotification(event: DriverDeliveryEvent): Promise<boolean> {
  if (!isLocalNotificationsAvailable() || event.type !== 'delivery.assigned') return false;
  const permission = await LocalNotifications.checkPermissions();
  if (permission.display !== 'granted') return false;
  await ensureDriverChannel();
  await LocalNotifications.schedule({
    notifications: [{
      id: notificationId(event.eventId),
      title: 'Nova entrega',
      body: `Você recebeu o pedido #${event.orderNumber}.`,
      channelId: DRIVER_DELIVERIES_CHANNEL_ID,
      extra: { route: '/', orderId: event.orderId },
    }],
  });
  return true;
}
