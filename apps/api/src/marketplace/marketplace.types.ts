import { MarketplaceConnection, MarketplaceDeliveryOwnership, MarketplaceProvider } from '@prisma/client';

export type ParsedMarketplaceEvent = {
  provider: MarketplaceProvider;
  eventId?: string | null;
  topic?: string | null;
  externalMerchantId?: string | null;
  externalStoreId?: string | null;
  externalOrderId?: string | null;
  eventCreatedAt?: Date | null;
  eventSequence?: bigint | null;
  orderPayload?: Record<string, unknown> | null;
  rawPayload: Record<string, unknown>;
};

export type ExternalMarketplaceOrder = Record<string, unknown>;

export type MarketplaceProviderOperationResult = {
  accepted: true;
  httpStatus: number;
  providerCode?: string | null;
};

export type MarketplaceCancellationReason = {
  code: string;
  description: string;
};

export type NormalizedMarketplaceOrderItem = {
  externalItemId?: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes?: string | null;
  productId?: string | null;
};

export type NormalizedMarketplaceOrder = {
  provider: MarketplaceProvider;
  connection: MarketplaceConnection;
  externalOrderId: string;
  externalDisplayId?: string | null;
  externalStatus?: string | null;
  externalCreatedAt?: Date | null;
  preparationStartAt?: Date | null;
  confirmationDeadlineAt?: Date | null;
  fulfillmentType: 'delivery' | 'pickup';
  deliveryOwnership: MarketplaceDeliveryOwnership;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  notes?: string | null;
  paymentMethod?: 'cash' | 'pix' | 'credit_card' | 'debit_card' | 'card_on_delivery' | 'other';
  items: NormalizedMarketplaceOrderItem[];
  deliveryAddress?: {
    street: string;
    number: string;
    complement?: string | null;
    neighborhood: string;
    city: string;
    state: string;
    zipCode: string;
    reference?: string | null;
    lat?: number | null;
    lng?: number | null;
  } | null;
  rawPayload: Record<string, unknown>;
};
