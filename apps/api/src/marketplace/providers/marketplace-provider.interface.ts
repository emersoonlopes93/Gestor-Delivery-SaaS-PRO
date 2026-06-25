import { MarketplaceConnection, MarketplaceProvider } from '@prisma/client';
import { ExternalMarketplaceOrder, NormalizedMarketplaceOrder, ParsedMarketplaceEvent } from '../marketplace.types';

export interface MarketplaceProviderAdapter {
  provider: MarketplaceProvider;
  validateWebhook(input: {
    headers: Record<string, string | string[] | undefined>;
    rawBody: Buffer | string;
    body: unknown;
  }): Promise<boolean>;
  parseWebhookEvent(input: {
    headers: Record<string, string | string[] | undefined>;
    body: unknown;
  }): Promise<ParsedMarketplaceEvent>;
  fetchOrderDetails(input: {
    connection: MarketplaceConnection;
    externalOrderId: string;
    eventPayload: Record<string, unknown>;
  }): Promise<ExternalMarketplaceOrder>;
  normalizeOrder(input: {
    connection: MarketplaceConnection;
    externalOrder: ExternalMarketplaceOrder;
  }): Promise<NormalizedMarketplaceOrder>;
  confirmOrder?(input: {
    connection: MarketplaceConnection;
    externalOrderId: string;
  }): Promise<void>;
  cancelOrder?(input: {
    connection: MarketplaceConnection;
    externalOrderId: string;
    reason?: string;
  }): Promise<void>;
}
