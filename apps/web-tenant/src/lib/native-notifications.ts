import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { ActionPerformed } from '@capacitor/local-notifications';

const ORDERS_CHANNEL_ID = 'orders';
const NOTIFIED_ORDER_IDS_KEY = 'native_notified_order_ids_v1';
const MAX_STORED_NOTIFIED_IDS = 120;

export type NewOrderNotificationPayload = {
  id?: string;
  orderNumber: string;
  customerName?: string;
  total?: number;
};

function isNativeNotificationsAvailable() {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('LocalNotifications');
}

function getStoredNotifiedIds() {
  try {
    const raw = localStorage.getItem(NOTIFIED_ORDER_IDS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function rememberNotifiedId(id: string) {
  const ids = [id, ...getStoredNotifiedIds().filter((storedId) => storedId !== id)]
    .slice(0, MAX_STORED_NOTIFIED_IDS);
  localStorage.setItem(NOTIFIED_ORDER_IDS_KEY, JSON.stringify(ids));
}

function notificationIdFromOrderId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) || Date.now() % 2147483647;
}

async function ensureOrdersChannel() {
  if (!isNativeNotificationsAvailable() || Capacitor.getPlatform() !== 'android') return;

  await LocalNotifications.createChannel({
    id: ORDERS_CHANNEL_ID,
    name: 'Pedidos',
    description: 'Notificacoes de novos pedidos recebidos',
    importance: 5,
    visibility: 1,
    vibration: true,
    lights: true,
    lightColor: '#0c93e9',
  });
}

export async function requestNativeNotificationPermission() {
  if (!isNativeNotificationsAvailable()) return 'unsupported' as const;

  const current = await LocalNotifications.checkPermissions();
  if (current.display === 'granted') {
    await ensureOrdersChannel();
    return current.display;
  }

  const requested = await LocalNotifications.requestPermissions();
  if (requested.display === 'granted') {
    await ensureOrdersChannel();
  }

  return requested.display;
}

export async function showNewOrderNotification(order: NewOrderNotificationPayload) {
  if (!isNativeNotificationsAvailable()) return false;

  const orderId = order.id || order.orderNumber;
  if (!orderId) return false;

  const notifiedIds = getStoredNotifiedIds();
  if (notifiedIds.includes(orderId)) return false;

  const permission = await requestNativeNotificationPermission();
  if (permission !== 'granted') return false;

  const total = typeof order.total === 'number'
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.total)
    : '';
  const body = `Pedido #${order.orderNumber}${total ? ` - ${total}` : ''}`;

  await LocalNotifications.schedule({
    notifications: [{
      id: notificationIdFromOrderId(orderId),
      title: 'Novo pedido recebido',
      body,
      largeBody: `${body}\nToque para abrir os pedidos.`,
      summaryText: order.customerName || 'Toque para abrir os pedidos',
      channelId: ORDERS_CHANNEL_ID,
      group: ORDERS_CHANNEL_ID,
      extra: {
        route: '/orders',
        orderId,
      },
    }],
  });

  rememberNotifiedId(orderId);
  return true;
}

export async function addNativeNotificationClickListener(onOpenOrders: () => void) {
  if (!isNativeNotificationsAvailable()) return undefined;

  return LocalNotifications.addListener(
    'localNotificationActionPerformed',
    (event: ActionPerformed) => {
      const route = event.notification.extra?.route;
      if (route === '/orders') {
        onOpenOrders();
      }
    },
  );
}
