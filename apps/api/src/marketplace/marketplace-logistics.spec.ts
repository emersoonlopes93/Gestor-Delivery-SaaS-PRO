import { MarketplaceProvider } from '@prisma/client';
import { allowsInternalDeliveryAssignment } from './marketplace-logistics';

describe('allowsInternalDeliveryAssignment', () => {
  it('allows direct, iFood and merchant-owned 99Food delivery', () => {
    expect(allowsInternalDeliveryAssignment([])).toBe(true);
    expect(allowsInternalDeliveryAssignment([{ provider: MarketplaceProvider.IFOOD, normalizedPayload: null }])).toBe(true);
    expect(allowsInternalDeliveryAssignment([{
      provider: MarketplaceProvider.FOOD_99,
      normalizedPayload: { logisticsOwnership: 'merchant' },
    }])).toBe(true);
  });

  it('blocks provider-owned or unknown 99Food delivery', () => {
    expect(allowsInternalDeliveryAssignment([{
      provider: MarketplaceProvider.FOOD_99,
      normalizedPayload: { logisticsOwnership: 'provider' },
    }])).toBe(false);
    expect(allowsInternalDeliveryAssignment([{
      provider: MarketplaceProvider.FOOD_99,
      normalizedPayload: null,
    }])).toBe(false);
  });
});
