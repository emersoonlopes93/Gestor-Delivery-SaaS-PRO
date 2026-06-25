export function canonicalSourceChannel(channel?: string | null): string {
  if (!channel?.trim()) return 'direct_online';
  if (channel === 'storefront') return 'direct_online';
  return channel;
}

export function billingSourceChannelsFor(channel?: string | null): string[] {
  const canonical = canonicalSourceChannel(channel);
  if (canonical === 'direct_online') {
    return ['direct_online', 'storefront'];
  }
  return [canonical];
}
