import { MarketplaceConnection, MarketplaceProvider } from '@prisma/client';
import {
  ExternalMarketplaceOrder,
  MarketplaceProviderOperationResult,
  MarketplaceCancellationReason,
  MarketplacePollAcknowledgment,
  NormalizedMarketplaceOrder,
  ParsedMarketplaceEvent,
} from '../marketplace.types';

export interface MarketplaceProviderAdapter {
  provider: MarketplaceProvider;
  validateWebhook(input: {
    headers: Record<string, string | string[] | undefined>;
    rawBody: Buffer | string;
    body: unknown;
  }): Promise<boolean>;
  parseWebhookEvent(input: {
    headers: Record<string, string | string[] | undefined>;
    rawBody?: Buffer | string;
    body: unknown;
  }): Promise<ParsedMarketplaceEvent>;
  parsePollingEvent?(body: Record<string, unknown>): Promise<ParsedMarketplaceEvent>;
  pollEvents?(input: {
    connection: MarketplaceConnection;
    merchantIds: string[];
    correlationId: string;
    filters?: { categories?: string; types?: string; groups?: string };
  }): Promise<Record<string, unknown>[]>;
  acknowledgeEvents?(input: {
    connection: MarketplaceConnection;
    eventIds: string[];
    events?: MarketplacePollAcknowledgment[];
    correlationId: string;
  }): Promise<{ accepted: true; httpStatus: number }>;
  fetchOrderDetails(input: {
    connection: MarketplaceConnection;
    externalOrderId: string;
    eventPayload: Record<string, unknown>;
  }): Promise<ExternalMarketplaceOrder>;
  fetchCurrentOrder?(input: {
    connection: MarketplaceConnection;
    externalOrderId: string;
    correlationId: string;
  }): Promise<ExternalMarketplaceOrder>;
  normalizeOrder(input: {
    connection: MarketplaceConnection;
    externalOrder: ExternalMarketplaceOrder;
  }): Promise<NormalizedMarketplaceOrder>;
  getCancellationReasons?(input: {
    connection: MarketplaceConnection;
    externalOrderId: string;
    correlationId: string;
  }): Promise<MarketplaceCancellationReason[]>;
  confirmOrder?(input: {
    connection: MarketplaceConnection;
    externalOrderId: string;
    correlationId: string;
  }): Promise<MarketplaceProviderOperationResult>;
  readyOrder?(input: {
    connection: MarketplaceConnection;
    externalOrderId: string;
    correlationId: string;
  }): Promise<MarketplaceProviderOperationResult>;
  dispatchOrder?(input: {
    connection: MarketplaceConnection;
    externalOrderId: string;
    correlationId: string;
  }): Promise<MarketplaceProviderOperationResult>;
  deliverOrder?(input: {
    connection: MarketplaceConnection;
    externalOrderId: string;
    correlationId: string;
  }): Promise<MarketplaceProviderOperationResult>;
  pickUpOrder?(input: {
    connection: MarketplaceConnection;
    externalOrderId: string;
    correlationId: string;
  }): Promise<MarketplaceProviderOperationResult>;
  cancelOrder?(input: {
    connection: MarketplaceConnection;
    externalOrderId: string;
    reason: string;
    correlationId: string;
  }): Promise<MarketplaceProviderOperationResult>;
  acceptCancellation?(input: {
    connection: MarketplaceConnection;
    externalOrderId: string;
    correlationId: string;
  }): Promise<MarketplaceProviderOperationResult>;
  denyCancellation?(input: {
    connection: MarketplaceConnection;
    externalOrderId: string;
    reason: string;
    correlationId: string;
  }): Promise<MarketplaceProviderOperationResult>;
}
