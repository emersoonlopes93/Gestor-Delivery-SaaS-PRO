import 'reflect-metadata';

import type { AnalyticsEventEnvelopeV1, AnalyticsEventNameV1 } from '@gestor/types';
import {
  ANALYTICS_EVENT_NAMES_V1,
  ANALYTICS_SCHEMA_VERSION_V1,
  AnalyticsEventEnvelopeV1Schema,
  AnalyticsPublicBrowserEventV1Schema,
  AnalyticsServerEventV1Schema,
  BROWSER_ANALYTICS_EVENT_NAMES_V1,
  SERVER_ANALYTICS_EVENT_NAMES_V1,
} from '../../../../packages/types/src/marketing-analytics';

const commonEnvelope = () => ({
  schemaVersion: 1 as const,
  eventId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
  occurredAt: '2026-07-28T12:00:00.000Z',
  sessionId: 'session_0123456789',
  page: {
    path: '/cardapio',
    landingPath: '/',
    referrerHost: 'example.com',
  },
  consent: {
    analytics: true,
    marketing: false,
    version: 'v1',
  },
});

const validEvents: Record<AnalyticsEventNameV1, Record<string, unknown>> = {
  menu_viewed: {
    ...commonEnvelope(),
    eventName: 'menu_viewed',
    source: 'browser',
  },
  category_viewed: {
    ...commonEnvelope(),
    eventName: 'category_viewed',
    source: 'browser',
    context: { categoryId: 'category_1' },
  },
  product_viewed: {
    ...commonEnvelope(),
    eventName: 'product_viewed',
    source: 'browser',
    context: { productId: 'product_1' },
  },
  product_selected: {
    ...commonEnvelope(),
    eventName: 'product_selected',
    source: 'browser',
    context: { productId: 'product_1' },
  },
  add_to_cart: {
    ...commonEnvelope(),
    eventName: 'add_to_cart',
    source: 'browser',
    context: { productId: 'product_1', cartId: 'cart_1' },
    metrics: { quantity: 2, unitPrice: 25, value: 50, currency: 'BRL' },
  },
  remove_from_cart: {
    ...commonEnvelope(),
    eventName: 'remove_from_cart',
    source: 'browser',
    context: { productId: 'product_1', cartLineId: 'line_1' },
    metrics: { quantity: 1 },
  },
  cart_viewed: {
    ...commonEnvelope(),
    eventName: 'cart_viewed',
    source: 'browser',
    context: { cartId: 'cart_1' },
    metrics: { itemCount: 2, value: 50, currency: 'BRL' },
  },
  checkout_started: {
    ...commonEnvelope(),
    eventName: 'checkout_started',
    source: 'browser',
    context: { cartId: 'cart_1' },
    metrics: { itemCount: 2, value: 50, currency: 'BRL' },
  },
  checkout_step_completed: {
    ...commonEnvelope(),
    eventName: 'checkout_step_completed',
    source: 'browser',
    context: { cartId: 'cart_1', checkoutStep: 'payment' },
  },
  order_submitted: {
    ...commonEnvelope(),
    eventName: 'order_submitted',
    source: 'browser',
    context: { orderId: 'order_1' },
    metrics: { itemCount: 2, value: 50, currency: 'BRL' },
  },
  search_performed: {
    ...commonEnvelope(),
    eventName: 'search_performed',
    source: 'browser',
    metrics: { itemCount: 4 },
  },
  coupon_applied: {
    ...commonEnvelope(),
    eventName: 'coupon_applied',
    source: 'browser',
    context: { cartId: 'cart_1' },
  },
  social_link_clicked: {
    ...commonEnvelope(),
    eventName: 'social_link_clicked',
    source: 'browser',
    context: { socialChannel: 'instagram' },
  },
  whatsapp_clicked: {
    ...commonEnvelope(),
    eventName: 'whatsapp_clicked',
    source: 'browser',
  },
  order_confirmed: {
    ...commonEnvelope(),
    eventName: 'order_confirmed',
    source: 'server',
    context: { orderId: 'order_1' },
    metrics: { value: 50, currency: 'BRL' },
  },
  order_completed: {
    ...commonEnvelope(),
    eventName: 'order_completed',
    source: 'server',
    context: { orderId: 'order_1' },
    metrics: { value: 50, currency: 'BRL' },
  },
  order_cancelled: {
    ...commonEnvelope(),
    eventName: 'order_cancelled',
    source: 'server',
    context: { orderId: 'order_1' },
  },
};

describe('marketing analytics contract v1', () => {
  it('exports a unique and complete event taxonomy', () => {
    expect(new Set(ANALYTICS_EVENT_NAMES_V1).size).toBe(ANALYTICS_EVENT_NAMES_V1.length);
    expect(ANALYTICS_EVENT_NAMES_V1).toEqual([
      ...BROWSER_ANALYTICS_EVENT_NAMES_V1,
      ...SERVER_ANALYTICS_EVENT_NAMES_V1,
    ]);

    for (const eventName of ANALYTICS_EVENT_NAMES_V1) {
      expect(AnalyticsEventEnvelopeV1Schema.safeParse(validEvents[eventName]).success).toBe(true);
    }
  });

  it('fixes schemaVersion at 1 and keeps the public export compilable', () => {
    const compiledExport: AnalyticsEventEnvelopeV1 = AnalyticsEventEnvelopeV1Schema.parse(
      validEvents.menu_viewed,
    );

    expect(ANALYTICS_SCHEMA_VERSION_V1).toBe(1);
    expect(compiledExport.schemaVersion).toBe(1);
    expect(
      AnalyticsEventEnvelopeV1Schema.safeParse({
        ...validEvents.menu_viewed,
        schemaVersion: 2,
      }).success,
    ).toBe(false);
  });

  it('separates browser events from authoritative server order events', () => {
    for (const eventName of BROWSER_ANALYTICS_EVENT_NAMES_V1) {
      expect(AnalyticsPublicBrowserEventV1Schema.safeParse(validEvents[eventName]).success).toBe(
        true,
      );
      expect(AnalyticsServerEventV1Schema.safeParse(validEvents[eventName]).success).toBe(false);
    }

    for (const eventName of SERVER_ANALYTICS_EVENT_NAMES_V1) {
      expect(AnalyticsServerEventV1Schema.safeParse(validEvents[eventName]).success).toBe(true);
      expect(AnalyticsPublicBrowserEventV1Schema.safeParse(validEvents[eventName]).success).toBe(
        false,
      );
    }

    expect(
      AnalyticsEventEnvelopeV1Schema.safeParse({
        ...validEvents.order_completed,
        source: 'browser',
      }).success,
    ).toBe(false);
  });

  it('rejects tenantId, unrestricted metadata and public PII fields', () => {
    const forbiddenFields = [
      'tenantId',
      'metadata',
      'name',
      'email',
      'phone',
      'address',
      'ip',
      'userAgent',
      'cookie',
      'authorization',
      'html',
      'javascript',
      'providerSecret',
    ];

    for (const field of forbiddenFields) {
      expect(
        AnalyticsPublicBrowserEventV1Schema.safeParse({
          ...validEvents.menu_viewed,
          [field]: 'forbidden',
        }).success,
      ).toBe(false);
    }

    expect(
      AnalyticsPublicBrowserEventV1Schema.safeParse({
        ...validEvents.menu_viewed,
        page: { path: '/cardapio?email=user@example.com' },
      }).success,
    ).toBe(false);
    expect(
      AnalyticsPublicBrowserEventV1Schema.safeParse({
        ...validEvents.menu_viewed,
        attribution: { campaign: 'user@example.com' },
      }).success,
    ).toBe(false);
  });

  it.each(['product_viewed', 'product_selected', 'add_to_cart', 'remove_from_cart'] as const)(
    'requires productId for %s',
    (eventName) => {
      const event = validEvents[eventName];
      expect(
        AnalyticsPublicBrowserEventV1Schema.safeParse({
          ...commonEnvelope(),
          eventName,
          source: 'browser',
          context: {},
          ...(eventName === 'add_to_cart' || eventName === 'remove_from_cart'
            ? { metrics: { quantity: 1 } }
            : {}),
        }).success,
      ).toBe(false);
      expect(AnalyticsPublicBrowserEventV1Schema.safeParse(event).success).toBe(true);
    },
  );

  it('requires categoryId for category events and orderId for order events', () => {
    expect(
      AnalyticsPublicBrowserEventV1Schema.safeParse({
        ...commonEnvelope(),
        eventName: 'category_viewed',
        source: 'browser',
        context: {},
      }).success,
    ).toBe(false);

    for (const eventName of SERVER_ANALYTICS_EVENT_NAMES_V1) {
      expect(
        AnalyticsServerEventV1Schema.safeParse({
          ...commonEnvelope(),
          eventName,
          source: 'server',
          context: {},
        }).success,
      ).toBe(false);
    }
  });

  it('requires positive cart quantity and limits currency to BRL', () => {
    expect(
      AnalyticsPublicBrowserEventV1Schema.safeParse({
        ...validEvents.add_to_cart,
        metrics: { quantity: 0 },
      }).success,
    ).toBe(false);
    expect(
      AnalyticsPublicBrowserEventV1Schema.safeParse({
        ...validEvents.checkout_started,
        metrics: { value: 50, currency: 'USD' },
      }).success,
    ).toBe(false);
  });

  it('requires an explicit consent snapshot', () => {
    const { consent: _consent, ...withoutConsent } = commonEnvelope();

    expect(
      AnalyticsPublicBrowserEventV1Schema.safeParse({
        ...withoutConsent,
        eventName: 'menu_viewed',
        source: 'browser',
      }).success,
    ).toBe(false);
  });
});
