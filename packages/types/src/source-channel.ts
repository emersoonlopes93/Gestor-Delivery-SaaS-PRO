export const OFFICIAL_SOURCE_CHANNELS = [
  'direct_online',
  'pos',
  'manual',
  'whatsapp_ai',
  'marketplace_ifood',
  'marketplace_rappi',
  'marketplace_ubereats',
  'marketplace_99food',
  'marketplace_ketta',
  'marketplace_ze_delivery',
] as const;

export type OfficialSourceChannel = (typeof OFFICIAL_SOURCE_CHANNELS)[number];

export type SourceChannel = OfficialSourceChannel | 'storefront';

export const SOURCE_CHANNEL_LABELS: Record<SourceChannel, string> = {
  direct_online: 'Cardápio Online',
  storefront: 'Cardápio Online',
  pos: 'Balcão / PDV',
  manual: 'Manual',
  whatsapp_ai: 'WhatsApp IA',
  marketplace_ifood: 'iFood',
  marketplace_rappi: 'Rappi',
  marketplace_ubereats: 'Uber Eats',
  marketplace_99food: '99Food',
  marketplace_ketta: 'Ketta',
  marketplace_ze_delivery: 'Zé Delivery',
};

export function normalizeSourceChannel(channel?: string | null): SourceChannel {
  if (!channel?.trim()) return 'direct_online';
  if (channel === 'storefront') return 'storefront';
  if ((OFFICIAL_SOURCE_CHANNELS as readonly string[]).includes(channel)) {
    return channel as OfficialSourceChannel;
  }
  return channel as SourceChannel;
}

export function canonicalSourceChannel(channel?: string | null): OfficialSourceChannel | string {
  const normalized = normalizeSourceChannel(channel);
  return normalized === 'storefront' ? 'direct_online' : normalized;
}

export function billingSourceChannelsFor(channel?: string | null): string[] {
  const normalized = normalizeSourceChannel(channel);
  if (normalized === 'storefront' || normalized === 'direct_online') {
    return ['direct_online', 'storefront'];
  }
  return [normalized];
}
