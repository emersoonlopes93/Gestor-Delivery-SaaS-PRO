import type { FulfillmentType, OrderAutoAcceptSettings } from '@gestor/types';

type AutoAcceptChannel = 'direct_online' | 'storefront' | 'marketplace_ifood' | 'whatsapp_ai' | 'pos' | string;
type AutoAcceptPaymentMethod = 'cash' | 'card_on_delivery' | 'other' | 'pix' | 'credit_card' | 'debit_card' | string | null | undefined;

export interface AutoAcceptCandidateOrder {
  id: string;
  status: string;
  fulfillmentType: FulfillmentType;
  sourceChannel: AutoAcceptChannel;
  paymentMethod?: AutoAcceptPaymentMethod;
}

export interface AutoAcceptContext {
  tenantStatus: string;
  storePaused: boolean;
}

export interface AutoAcceptDecision {
  allowed: boolean;
  reason?: string;
}

const STOREFRONT_CHANNELS = new Set<AutoAcceptChannel>(['direct_online', 'storefront']);
const ALLOWED_PAYMENT_METHODS = new Set<AutoAcceptPaymentMethod>(['cash', 'card_on_delivery', 'other']);

export function canAutoAcceptOrder(
  order: AutoAcceptCandidateOrder,
  settings: OrderAutoAcceptSettings,
  context: AutoAcceptContext,
): AutoAcceptDecision {
  if (!settings.autoAcceptOrdersEnabled) {
    return { allowed: false, reason: 'auto_accept_disabled' };
  }

  if (settings.autoAcceptDelaySeconds > 0) {
    return { allowed: false, reason: 'auto_accept_delay_not_supported' };
  }

  if (context.tenantStatus !== 'active') {
    return { allowed: false, reason: 'tenant_not_active' };
  }

  if (context.storePaused) {
    return { allowed: false, reason: 'store_paused' };
  }

  if (order.status !== 'pending') {
    return { allowed: false, reason: 'order_not_pending' };
  }

  if (!STOREFRONT_CHANNELS.has(order.sourceChannel)) {
    return { allowed: false, reason: 'channel_not_supported' };
  }

  if (order.fulfillmentType === 'delivery' && !settings.autoAcceptDeliveryOrders) {
    return { allowed: false, reason: 'delivery_disabled' };
  }

  if (order.fulfillmentType === 'pickup' && !settings.autoAcceptPickupOrders) {
    return { allowed: false, reason: 'pickup_disabled' };
  }

  if (!ALLOWED_PAYMENT_METHODS.has(order.paymentMethod)) {
    return { allowed: false, reason: 'payment_requires_confirmation' };
  }

  return { allowed: true };
}
