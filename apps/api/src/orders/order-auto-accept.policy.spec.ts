import { canAutoAcceptOrder } from './order-auto-accept.policy';
import type { OrderAutoAcceptSettings } from '@gestor/types';

const baseSettings: OrderAutoAcceptSettings = {
  autoAcceptOrdersEnabled: true,
  autoAcceptDelaySeconds: 0,
  autoAcceptDeliveryOrders: true,
  autoAcceptPickupOrders: true,
};

const baseOrder = {
  id: 'order-1',
  status: 'pending',
  fulfillmentType: 'pickup' as const,
  sourceChannel: 'direct_online',
  paymentMethod: 'cash',
};

describe('canAutoAcceptOrder', () => {
  it('blocks when auto-accept is disabled', () => {
    expect(canAutoAcceptOrder(baseOrder, {
      ...baseSettings,
      autoAcceptOrdersEnabled: false,
    }, {
      tenantStatus: 'active',
      storePaused: false,
    })).toEqual({
      allowed: false,
      reason: 'auto_accept_disabled',
    });
  });

  it('allows a valid storefront pickup order', () => {
    expect(canAutoAcceptOrder(baseOrder, baseSettings, {
      tenantStatus: 'active',
      storePaused: false,
    })).toEqual({ allowed: true });
  });

  it('blocks unsupported channels such as marketplace', () => {
    expect(canAutoAcceptOrder({
      ...baseOrder,
      sourceChannel: 'marketplace_ifood',
    }, baseSettings, {
      tenantStatus: 'active',
      storePaused: false,
    })).toEqual({
      allowed: false,
      reason: 'channel_not_supported',
    });
  });

  it('blocks pending online payment methods', () => {
    expect(canAutoAcceptOrder({
      ...baseOrder,
      paymentMethod: 'credit_card',
    }, baseSettings, {
      tenantStatus: 'active',
      storePaused: false,
    })).toEqual({
      allowed: false,
      reason: 'payment_requires_confirmation',
    });
  });

  it('blocks store-paused scenarios', () => {
    expect(canAutoAcceptOrder(baseOrder, baseSettings, {
      tenantStatus: 'active',
      storePaused: true,
    })).toEqual({
      allowed: false,
      reason: 'store_paused',
    });
  });
});
