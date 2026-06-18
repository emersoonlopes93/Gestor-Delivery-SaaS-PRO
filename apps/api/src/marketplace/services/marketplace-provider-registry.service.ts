import { Injectable, NotFoundException } from '@nestjs/common';
import { MarketplaceProvider } from '@prisma/client';
import { IfoodProvider } from '../providers/ifood.provider';
import { MarketplaceProviderAdapter } from '../providers/marketplace-provider.interface';

@Injectable()
export class MarketplaceProviderRegistryService {
  private readonly providers = new Map<MarketplaceProvider, MarketplaceProviderAdapter>();

  constructor(ifoodProvider: IfoodProvider) {
    this.providers.set(MarketplaceProvider.IFOOD, ifoodProvider);
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
    throw new NotFoundException(`Marketplace provider not supported: ${provider}`);
  }
}
