import type { MarketplaceDeliveryOwnership, MarketplaceProvider } from '@prisma/client';

export type MarketplaceOwnershipRecord = {
  provider: MarketplaceProvider;
  deliveryOwnership: MarketplaceDeliveryOwnership;
};

export type OwnFleetEligibility = {
  eligible: boolean;
  provider: MarketplaceProvider | null;
  deliveryOwnership: MarketplaceDeliveryOwnership | 'NATIVE';
  reason: 'NATIVE_ORDER' | 'MERCHANT_DELIVERY' | 'PROVIDER_DELIVERY' | 'UNKNOWN_DELIVERY_OWNERSHIP';
};

export function evaluateOwnFleetEligibility(records: readonly MarketplaceOwnershipRecord[]): OwnFleetEligibility {
  if (records.length === 0) {
    return { eligible: true, provider: null, deliveryOwnership: 'NATIVE', reason: 'NATIVE_ORDER' };
  }
  const providerOwned = records.find((record) => record.deliveryOwnership === 'PROVIDER');
  if (providerOwned) {
    return { eligible: false, provider: providerOwned.provider, deliveryOwnership: 'PROVIDER', reason: 'PROVIDER_DELIVERY' };
  }
  const unknown = records.find((record) => record.deliveryOwnership !== 'MERCHANT');
  if (unknown) {
    return { eligible: false, provider: unknown.provider, deliveryOwnership: 'UNKNOWN', reason: 'UNKNOWN_DELIVERY_OWNERSHIP' };
  }
  return { eligible: true, provider: records[0]?.provider ?? null, deliveryOwnership: 'MERCHANT', reason: 'MERCHANT_DELIVERY' };
}
