export type SystemSoundEvent =
  | 'order.new'
  | 'order.cancelled'
  | 'order.accepted'
  | 'order.auto_accepted'
  | 'order.kds_ready'
  | 'order.out_for_delivery'
  | 'store.closed'
  | 'store.opened'
  | 'connection.lost'
  | 'connection.restored'
  | 'error.critical'
  | 'whatsapp.handoff';

export type SoundPriority = 'low' | 'medium' | 'high' | 'critical';

export type SoundCatalogEntry = {
  event: SystemSoundEvent;
  asset: string;
  priority: SoundPriority;
  repeat?: boolean;
  cooldownMs?: number;
};

export const SOUND_CATALOG: Record<SystemSoundEvent, SoundCatalogEntry> = {
  'order.new': {
    event: 'order.new',
    asset: '/sounds/Novo Pedido (M).mp3',
    priority: 'critical',
    cooldownMs: 8_000,
  },
  'order.cancelled': {
    event: 'order.cancelled',
    asset: '/sounds/pedido de cancelamento(M).mp3',
    priority: 'high',
    cooldownMs: 5_000,
  },
  'order.accepted': {
    event: 'order.accepted',
    asset: '/sounds/notification.mp3',
    priority: 'medium',
    cooldownMs: 4_000,
  },
  'order.auto_accepted': {
    event: 'order.auto_accepted',
    asset: '/sounds/notification.mp3',
    priority: 'medium',
    cooldownMs: 4_000,
  },
  'order.kds_ready': {
    event: 'order.kds_ready',
    asset: '/sounds/Pedido Pronto (M).mp3',
    priority: 'high',
    cooldownMs: 5_000,
  },
  'order.out_for_delivery': {
    event: 'order.out_for_delivery',
    asset: '/sounds/notification.mp3',
    priority: 'medium',
    cooldownMs: 4_000,
  },
  'store.closed': {
    event: 'store.closed',
    asset: '/sounds/notification.mp3',
    priority: 'high',
    cooldownMs: 10_000,
  },
  'store.opened': {
    event: 'store.opened',
    asset: '/sounds/notification.mp3',
    priority: 'low',
    cooldownMs: 10_000,
  },
  'connection.lost': {
    event: 'connection.lost',
    asset: '/sounds/Microsoft-Teams.mp3',
    priority: 'critical',
    cooldownMs: 12_000,
  },
  'connection.restored': {
    event: 'connection.restored',
    asset: '/sounds/notification.mp3',
    priority: 'low',
    cooldownMs: 8_000,
  },
  'error.critical': {
    event: 'error.critical',
    asset: '/sounds/Microsoft-Teams.mp3',
    priority: 'critical',
    cooldownMs: 10_000,
  },
  'whatsapp.handoff': {
    event: 'whatsapp.handoff',
    asset: '/sounds/transferindo para atendente (H).mp3',
    priority: 'high',
    cooldownMs: 5_000,
  },
};

export function getSoundCatalogEntry(event: SystemSoundEvent): SoundCatalogEntry {
  return SOUND_CATALOG[event];
}
