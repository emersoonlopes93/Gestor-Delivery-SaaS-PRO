import { z } from 'zod';

export const ANALYTICS_SCHEMA_VERSION_V1 = 1 as const;

export const BROWSER_ANALYTICS_EVENT_NAMES_V1 = [
  'menu_viewed',
  'category_viewed',
  'product_viewed',
  'product_selected',
  'add_to_cart',
  'remove_from_cart',
  'cart_viewed',
  'checkout_started',
  'checkout_step_completed',
  'order_submitted',
  'search_performed',
  'coupon_applied',
  'social_link_clicked',
  'whatsapp_clicked',
] as const;

export const SERVER_ANALYTICS_EVENT_NAMES_V1 = [
  'order_confirmed',
  'order_completed',
  'order_cancelled',
] as const;

export const ANALYTICS_EVENT_NAMES_V1 = [
  ...BROWSER_ANALYTICS_EVENT_NAMES_V1,
  ...SERVER_ANALYTICS_EVENT_NAMES_V1,
] as const;

export type BrowserAnalyticsEventNameV1 = (typeof BROWSER_ANALYTICS_EVENT_NAMES_V1)[number];
export type ServerAnalyticsEventNameV1 = (typeof SERVER_ANALYTICS_EVENT_NAMES_V1)[number];
export type AnalyticsEventNameV1 = (typeof ANALYTICS_EVENT_NAMES_V1)[number];

const opaqueIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._-]+$/);

const sessionIdSchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

const uuidOrUlidSchema = z.union([
  z.string().uuid(),
  z.string().length(26).regex(/^[0-9A-HJKMNP-TV-Z]{26}$/i),
]);

const pagePathSchema = z
  .string()
  .min(1)
  .max(512)
  .startsWith('/')
  .refine((value) => !value.includes('?') && !value.includes('#') && !value.includes('://'));

const referrerHostSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i,
  );

const attributionValueSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[^\s@?&#=]+$/);

export const AnalyticsPageContextV1Schema = z
  .object({
    path: pagePathSchema,
    landingPath: pagePathSchema.optional(),
    referrerHost: referrerHostSchema.optional(),
  })
  .strict();

export type AnalyticsPageContextV1 = z.infer<typeof AnalyticsPageContextV1Schema>;

export const AnalyticsAttributionV1Schema = z
  .object({
    source: attributionValueSchema.optional(),
    medium: attributionValueSchema.optional(),
    campaign: attributionValueSchema.optional(),
    content: attributionValueSchema.optional(),
    term: attributionValueSchema.optional(),
  })
  .strict();

export type AnalyticsAttributionV1 = z.infer<typeof AnalyticsAttributionV1Schema>;

export const AnalyticsConsentSnapshotV1Schema = z
  .object({
    analytics: z.boolean(),
    marketing: z.boolean(),
    version: z.string().min(1).max(32).regex(/^[A-Za-z0-9._-]+$/),
  })
  .strict();

export type AnalyticsConsentSnapshotV1 = z.infer<typeof AnalyticsConsentSnapshotV1Schema>;

export const AnalyticsSocialChannelV1Schema = z.enum([
  'instagram',
  'facebook',
  'tiktok',
  'google_reviews',
  'website',
  'other',
]);

export type AnalyticsSocialChannelV1 = z.infer<typeof AnalyticsSocialChannelV1Schema>;

export const AnalyticsCheckoutStepV1Schema = z.enum([
  'contact',
  'fulfillment',
  'address',
  'payment',
  'review',
]);

export type AnalyticsCheckoutStepV1 = z.infer<typeof AnalyticsCheckoutStepV1Schema>;

const baseEnvelopeShape = {
  schemaVersion: z.literal(ANALYTICS_SCHEMA_VERSION_V1),
  eventId: uuidOrUlidSchema,
  occurredAt: z.string().datetime({ offset: true }),
  sessionId: sessionIdSchema,
  visitorId: sessionIdSchema.optional(),
  page: AnalyticsPageContextV1Schema.optional(),
  attribution: AnalyticsAttributionV1Schema.optional(),
  consent: AnalyticsConsentSnapshotV1Schema,
};

const categoryContextSchema = z.object({ categoryId: opaqueIdSchema }).strict();
const productContextSchema = z.object({ productId: opaqueIdSchema }).strict();
const cartContextSchema = z.object({ cartId: opaqueIdSchema.optional() }).strict();
const productCartContextSchema = z
  .object({
    productId: opaqueIdSchema,
    cartId: opaqueIdSchema.optional(),
    cartLineId: opaqueIdSchema.optional(),
  })
  .strict();
const orderContextSchema = z.object({ orderId: opaqueIdSchema }).strict();
const socialContextSchema = z.object({ socialChannel: AnalyticsSocialChannelV1Schema }).strict();
const checkoutStepContextSchema = z
  .object({
    cartId: opaqueIdSchema.optional(),
    checkoutStep: AnalyticsCheckoutStepV1Schema,
  })
  .strict();

const quantityMetricsSchema = z
  .object({
    quantity: z.number().int().positive().max(999),
    unitPrice: z.number().finite().nonnegative().max(1_000_000).optional(),
    value: z.number().finite().nonnegative().max(1_000_000_000).optional(),
    currency: z.literal('BRL').optional(),
  })
  .strict();

const cartMetricsSchema = z
  .object({
    itemCount: z.number().int().nonnegative().max(999).optional(),
    value: z.number().finite().nonnegative().max(1_000_000_000).optional(),
    currency: z.literal('BRL').optional(),
  })
  .strict();

const resultMetricsSchema = z
  .object({
    itemCount: z.number().int().nonnegative().max(100_000).optional(),
  })
  .strict();

const serverOrderMetricsSchema = z
  .object({
    itemCount: z.number().int().nonnegative().max(999).optional(),
    value: z.number().finite().nonnegative().max(1_000_000_000).optional(),
    currency: z.literal('BRL').optional(),
  })
  .strict();

const menuViewedSchema = z
  .object({
    ...baseEnvelopeShape,
    eventName: z.literal('menu_viewed'),
    source: z.literal('browser'),
  })
  .strict();

const categoryViewedSchema = z
  .object({
    ...baseEnvelopeShape,
    eventName: z.literal('category_viewed'),
    source: z.literal('browser'),
    context: categoryContextSchema,
  })
  .strict();

const productViewedSchema = z
  .object({
    ...baseEnvelopeShape,
    eventName: z.literal('product_viewed'),
    source: z.literal('browser'),
    context: productContextSchema,
  })
  .strict();

const productSelectedSchema = z
  .object({
    ...baseEnvelopeShape,
    eventName: z.literal('product_selected'),
    source: z.literal('browser'),
    context: productContextSchema,
  })
  .strict();

const addToCartSchema = z
  .object({
    ...baseEnvelopeShape,
    eventName: z.literal('add_to_cart'),
    source: z.literal('browser'),
    context: productCartContextSchema,
    metrics: quantityMetricsSchema,
  })
  .strict();

const removeFromCartSchema = z
  .object({
    ...baseEnvelopeShape,
    eventName: z.literal('remove_from_cart'),
    source: z.literal('browser'),
    context: productCartContextSchema,
    metrics: quantityMetricsSchema,
  })
  .strict();

const cartViewedSchema = z
  .object({
    ...baseEnvelopeShape,
    eventName: z.literal('cart_viewed'),
    source: z.literal('browser'),
    context: cartContextSchema.optional(),
    metrics: cartMetricsSchema.optional(),
  })
  .strict();

const checkoutStartedSchema = z
  .object({
    ...baseEnvelopeShape,
    eventName: z.literal('checkout_started'),
    source: z.literal('browser'),
    context: cartContextSchema.optional(),
    metrics: cartMetricsSchema.optional(),
  })
  .strict();

const checkoutStepCompletedSchema = z
  .object({
    ...baseEnvelopeShape,
    eventName: z.literal('checkout_step_completed'),
    source: z.literal('browser'),
    context: checkoutStepContextSchema,
  })
  .strict();

const orderSubmittedSchema = z
  .object({
    ...baseEnvelopeShape,
    eventName: z.literal('order_submitted'),
    source: z.literal('browser'),
    context: orderContextSchema,
    metrics: cartMetricsSchema.optional(),
  })
  .strict();

const searchPerformedSchema = z
  .object({
    ...baseEnvelopeShape,
    eventName: z.literal('search_performed'),
    source: z.literal('browser'),
    metrics: resultMetricsSchema.optional(),
  })
  .strict();

const couponAppliedSchema = z
  .object({
    ...baseEnvelopeShape,
    eventName: z.literal('coupon_applied'),
    source: z.literal('browser'),
    context: cartContextSchema.optional(),
  })
  .strict();

const socialLinkClickedSchema = z
  .object({
    ...baseEnvelopeShape,
    eventName: z.literal('social_link_clicked'),
    source: z.literal('browser'),
    context: socialContextSchema,
  })
  .strict();

const whatsappClickedSchema = z
  .object({
    ...baseEnvelopeShape,
    eventName: z.literal('whatsapp_clicked'),
    source: z.literal('browser'),
  })
  .strict();

const orderConfirmedSchema = z
  .object({
    ...baseEnvelopeShape,
    eventName: z.literal('order_confirmed'),
    source: z.literal('server'),
    context: orderContextSchema,
    metrics: serverOrderMetricsSchema.optional(),
  })
  .strict();

const orderCompletedSchema = z
  .object({
    ...baseEnvelopeShape,
    eventName: z.literal('order_completed'),
    source: z.literal('server'),
    context: orderContextSchema,
    metrics: serverOrderMetricsSchema.optional(),
  })
  .strict();

const orderCancelledSchema = z
  .object({
    ...baseEnvelopeShape,
    eventName: z.literal('order_cancelled'),
    source: z.literal('server'),
    context: orderContextSchema,
  })
  .strict();

export const AnalyticsPublicBrowserEventV1Schema = z.discriminatedUnion('eventName', [
  menuViewedSchema,
  categoryViewedSchema,
  productViewedSchema,
  productSelectedSchema,
  addToCartSchema,
  removeFromCartSchema,
  cartViewedSchema,
  checkoutStartedSchema,
  checkoutStepCompletedSchema,
  orderSubmittedSchema,
  searchPerformedSchema,
  couponAppliedSchema,
  socialLinkClickedSchema,
  whatsappClickedSchema,
]);

export const AnalyticsServerEventV1Schema = z.discriminatedUnion('eventName', [
  orderConfirmedSchema,
  orderCompletedSchema,
  orderCancelledSchema,
]);

export const AnalyticsEventEnvelopeV1Schema = z.discriminatedUnion('eventName', [
  menuViewedSchema,
  categoryViewedSchema,
  productViewedSchema,
  productSelectedSchema,
  addToCartSchema,
  removeFromCartSchema,
  cartViewedSchema,
  checkoutStartedSchema,
  checkoutStepCompletedSchema,
  orderSubmittedSchema,
  searchPerformedSchema,
  couponAppliedSchema,
  socialLinkClickedSchema,
  whatsappClickedSchema,
  orderConfirmedSchema,
  orderCompletedSchema,
  orderCancelledSchema,
]);

export type AnalyticsPublicBrowserEventV1 = z.infer<typeof AnalyticsPublicBrowserEventV1Schema>;
export type AnalyticsServerEventV1 = z.infer<typeof AnalyticsServerEventV1Schema>;
export type AnalyticsEventEnvelopeV1 = z.infer<typeof AnalyticsEventEnvelopeV1Schema>;
export type AnalyticsEventContextV1 =
  | z.infer<typeof categoryContextSchema>
  | z.infer<typeof productContextSchema>
  | z.infer<typeof cartContextSchema>
  | z.infer<typeof productCartContextSchema>
  | z.infer<typeof orderContextSchema>
  | z.infer<typeof socialContextSchema>
  | z.infer<typeof checkoutStepContextSchema>;
export type AnalyticsEventMetricsV1 =
  | z.infer<typeof quantityMetricsSchema>
  | z.infer<typeof cartMetricsSchema>
  | z.infer<typeof resultMetricsSchema>
  | z.infer<typeof serverOrderMetricsSchema>;

export const ANALYTICS_ROLLUP_QUEUE = 'analytics-rollup' as const;
export const ANALYTICS_DAILY_ROLLUP_JOB = 'analytics.daily-rollup' as const;

export const ANALYTICS_AGGREGATE_DIMENSION_TYPES = [
  'overall',
  'product',
  'category',
  'utm_source',
  'utm_medium',
  'utm_campaign',
] as const;

export type AnalyticsAggregateDimensionType =
  (typeof ANALYTICS_AGGREGATE_DIMENSION_TYPES)[number];

export const ANALYTICS_ROLLUP_REASONS = [
  'scheduled',
  'backfill',
  'late-event-recompute',
] as const;

export const AnalyticsRollupJobV1Schema = z
  .object({
    tenantId: opaqueIdSchema,
    fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    timezone: z.string().min(1).max(64),
    reason: z.enum(ANALYTICS_ROLLUP_REASONS),
    requestedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export type AnalyticsRollupJobV1 = z.infer<typeof AnalyticsRollupJobV1Schema>;
