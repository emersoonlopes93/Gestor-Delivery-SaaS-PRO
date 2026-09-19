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

export type MarketplacePollAcknowledgment = {
  id: string;
  orderId: string;
  eventType: string;
};

export type MarketplaceLogisticsOwnership = 'merchant' | 'provider' | 'not_applicable' | 'unknown';

export type NormalizedMarketplaceOrderOption = {
  externalOptionId?: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  /** Relative depth from the product in provider-supplied nested add-ons. */
  hierarchyDepth?: number;
};

export type NormalizedMarketplaceOrderItem = {
  externalItemId?: string | null;
  /**
   * Provider identity that is stable enough to be compared with a PedeHub
   * product code. It is deliberately separate from the display/order item ID:
   * some provider item IDs are recreated and must never drive stock depletion.
   */
  catalogIdentity?: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes?: string | null;
  productId?: string | null;
  options?: NormalizedMarketplaceOrderOption[];
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
  isPrepaid?: boolean;
  amountDue?: number;
  /** Explicit 99Food semantic facts. Kept additive to avoid reinterpreting legacy fields. */
  grossOrderValue?: number | null;
  customerActuallyPaid?: number | null;
  customerNeedsToPay?: number | null;
  merchantEstimatedReceivable?: number | null;
  customerPaidAmount?: number | null;
  amountToCollect?: number | null;
  paymentStatus?: 'PAID' | 'PENDING' | 'UNKNOWN';
  collectionResponsibility?: 'MARKETPLACE' | 'MERCHANT' | 'DRIVER' | 'UNKNOWN';
  merchantReceivable?: number | null;
  merchantFundedDiscount?: number | null;
  platformFundedDiscount?: number | null;
  platformFees?: number | null;
  providerPriceFields?: {
    realPrice: number | null;
    realPayPrice: number | null;
    shopPaidMoney: number | null;
  };
  changeFor?: number | null;
  itemsSubtotal?: number;
  discountTotal?: number;
  deliveryFee?: number;
  serviceFee?: number;
  total?: number;
  scheduledFor?: Date | null;
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
