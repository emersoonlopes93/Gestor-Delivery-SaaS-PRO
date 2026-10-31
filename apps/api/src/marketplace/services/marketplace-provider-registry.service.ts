import { Injectable, NotFoundException } from '@nestjs/common';
import { MarketplaceProvider } from '@prisma/client';
import { IfoodProvider } from '../providers/ifood.provider';
import { Food99Provider } from '../providers/food99.provider';
import { MarketplaceProviderAdapter } from '../providers/marketplace-provider.interface';

@Injectable()
export class MarketplaceProviderRegistryService {
  private readonly providers = new Map<MarketplaceProvider, MarketplaceProviderAdapter>();

  constructor(ifoodProvider: IfoodProvider, food99Provider: Food99Provider) {
    this.providers.set(MarketplaceProvider.IFOOD, ifoodProvider);
    this.providers.set(MarketplaceProvider.FOOD_99, food99Provider);
  }

  get(provider: MarketplaceProvider): MarketplaceProviderAdapter {
    const adapter = this.providers.get(provider);
    if (!adapter) {
      throw new NotFoundException(`Marketplace provider not available: ${provider}`);
    }
    return adapter;
  }

  parseProvider(provider: string): MarketplaceProvider {
    const normalized = provider.trim().toLowerCase();
    if (normalized === 'ifood') return MarketplaceProvider.IFOOD;
    if (normalized === '99food' || normalized === 'food99' || normalized === 'food_99') {
      return MarketplaceProvider.FOOD_99;
    }
    throw new NotFoundException(`Marketplace provider not supported: ${provider}`);
  }
}
