import { MarketplaceDeliveryOwnership, MarketplaceProvider } from '@prisma/client';
import { evaluateOwnFleetEligibility } from './own-fleet-eligibility';

describe('evaluateOwnFleetEligibility', () => {
  it('allows native PedeHub orders', () => {
    expect(evaluateOwnFleetEligibility([])).toEqual(expect.objectContaining({ eligible: true, deliveryOwnership: 'NATIVE' }));
  });

  it('allows marketplace merchant delivery', () => {
    expect(evaluateOwnFleetEligibility([{ provider: MarketplaceProvider.IFOOD, deliveryOwnership: MarketplaceDeliveryOwnership.MERCHANT }])).toEqual(expect.objectContaining({ eligible: true, deliveryOwnership: 'MERCHANT' }));
  });

  it('blocks marketplace provider delivery', () => {
    expect(evaluateOwnFleetEligibility([{ provider: MarketplaceProvider.IFOOD, deliveryOwnership: MarketplaceDeliveryOwnership.PROVIDER }])).toEqual(expect.objectContaining({ eligible: false, reason: 'PROVIDER_DELIVERY' }));
  });

  it('fails closed for unknown marketplace ownership', () => {
    expect(evaluateOwnFleetEligibility([{ provider: MarketplaceProvider.IFOOD, deliveryOwnership: MarketplaceDeliveryOwnership.UNKNOWN }])).toEqual(expect.objectContaining({ eligible: false, reason: 'UNKNOWN_DELIVERY_OWNERSHIP' }));
  });
});
