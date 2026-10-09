import {
  AnalyticsPublicBrowserEventV1Schema,
  type AnalyticsConsentSnapshotV1,
  type AnalyticsPublicBrowserEventV1,
} from '@gestor/types';
import { getAnalyticsSessionId, clearAnalyticsSession } from './analytics-session';

export interface AnalyticsBatchResponse { accepted: number; duplicates: number; ignored: number }
export type AnalyticsTransport = (slug: string, events: AnalyticsPublicBrowserEventV1[]) => Promise<AnalyticsBatchResponse>;

const MAX_BATCH_SIZE = 20;
const MAX_RETRIES = 2;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export class AnalyticsDispatcher {
  private queue: AnalyticsPublicBrowserEventV1[] = [];
  private flushing = false;
  private activeFlush: Promise<void> | null = null;
  private flushTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

  constructor(
    private readonly slug: string,
    private readonly transport: AnalyticsTransport,
    _now: () => number = Date.now,
  ) {}

  enqueue(event: AnalyticsPublicBrowserEventV1) {
    this.queue.push(event);
    if (this.queue.length >= MAX_BATCH_SIZE) {
      void this.flush();
      return;
    }
    if (this.flushTimer === null) {
      this.flushTimer = globalThis.setTimeout(() => {
        this.flushTimer = null;
        void this.flush();
      }, 100);
    }
  }

  get queuedCount() { return this.queue.length; }

  clear() {
    this.queue = [];
    if (this.flushTimer !== null) {
      globalThis.clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }

  async flush(): Promise<void> {
    if (this.flushing) {
      await this.activeFlush;
      return;
    }
    if (this.queue.length === 0) return;
    this.flushing = true;
    this.activeFlush = (async () => {
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, MAX_BATCH_SIZE);
        await this.sendWithRetry(batch);
      }
    })();
    try { await this.activeFlush; } finally {
      this.activeFlush = null;
      this.flushing = false;
    }
  }

  private async sendWithRetry(batch: AnalyticsPublicBrowserEventV1[]) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        await this.transport(this.slug, batch);
        return;
      } catch (error) {
        const status = typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number'
          ? error.status
          : undefined;
        if (attempt === MAX_RETRIES || (status !== undefined && !RETRYABLE_STATUS.has(status))) return;
        await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 50 * (attempt + 1)));
      }
    }
  }
}

export interface AnalyticsRuntime {
  track: (eventName: AnalyticsEventName, input?: AnalyticsEventInput) => void;
  flush: () => Promise<void>;
  revoke: () => void;
}

export type AnalyticsEventName =
  | 'menu_viewed' | 'product_selected' | 'product_viewed' | 'add_to_cart' | 'remove_from_cart'
  | 'cart_viewed' | 'checkout_started' | 'order_submitted' | 'category_viewed' | 'coupon_applied'
  | 'whatsapp_clicked' | 'social_link_clicked';

export type AnalyticsEventInput = {
  productId?: string; categoryId?: string; orderId?: string; cartId?: string;
  quantity?: number; value?: number; itemCount?: number; unitPrice?: number;
  checkoutStep?: 'contact' | 'fulfillment' | 'address' | 'payment' | 'review';
  socialChannel?: 'instagram' | 'facebook' | 'tiktok' | 'google_reviews' | 'website' | 'other';
  pagePath?: string;
};

export function createAnalyticsEvent(
  eventName: AnalyticsEventName,
  input: AnalyticsEventInput,
  consent: AnalyticsConsentSnapshotV1,
  sessionId: string,
  now = new Date(),
): AnalyticsPublicBrowserEventV1 {
  const base = {
    schemaVersion: 1 as const,
    eventId: createEventId(),
    occurredAt: now.toISOString(),
    sessionId,
    source: 'browser' as const,
    consent,
    page: { path: input.pagePath ?? (typeof window !== 'undefined' ? window.location.pathname : '/') },
  };
  const candidate: Record<string, unknown> = { ...base, eventName };
  if (eventName === 'category_viewed') candidate.context = { categoryId: input.categoryId };
  if (['product_selected', 'product_viewed'].includes(eventName)) candidate.context = { productId: input.productId };
  if (['add_to_cart', 'remove_from_cart'].includes(eventName)) {
    candidate.context = { productId: input.productId, cartId: input.cartId };
    candidate.metrics = { quantity: input.quantity ?? 1, unitPrice: input.unitPrice, value: input.value, currency: 'BRL' };
  }
  if (eventName === 'order_submitted') candidate.context = { orderId: input.orderId };
  if (eventName === 'cart_viewed' || eventName === 'checkout_started') {
    if (input.cartId) candidate.context = { cartId: input.cartId };
    if (input.itemCount !== undefined || input.value !== undefined) candidate.metrics = { itemCount: input.itemCount, value: input.value, currency: 'BRL' };
  }
  if (eventName === 'coupon_applied' && input.cartId) candidate.context = { cartId: input.cartId };
  if (eventName === 'social_link_clicked') candidate.context = { socialChannel: input.socialChannel };
  const parsed = AnalyticsPublicBrowserEventV1Schema.safeParse(candidate);
  if (!parsed.success) throw new Error('invalid analytics event');
  return parsed.data;
}

function createEventId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch { /* use the standards-compatible fallback */ }
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}

export function createAnalyticsRuntime(slug: string, consentSnapshot: () => AnalyticsConsentSnapshotV1): AnalyticsRuntime {
  let sessionId: string | null = null;
  const dispatcher = new AnalyticsDispatcher(slug, async (tenantSlug, events) => {
    const response = await fetch(`/api/v1/public/storefront/${encodeURIComponent(tenantSlug)}/analytics/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events }),
    });
    if (!response.ok) {
      const error = new Error('analytics transport failed') as Error & { status?: number };
      error.status = response.status;
      throw error;
    }
    return response.json() as Promise<AnalyticsBatchResponse>;
  });
  return {
    track: (eventName, input = {}) => {
      const consent = consentSnapshot();
      if (!consent.analytics) return;
      sessionId ??= getAnalyticsSessionId(slug);
      try { dispatcher.enqueue(createAnalyticsEvent(eventName, input, consent, sessionId)); } catch { /* analytics never blocks storefront */ }
    },
    flush: () => dispatcher.flush(),
    revoke: () => { dispatcher.clear(); sessionId = null; clearAnalyticsSession(slug); },
  };
}

export const analyticsDispatcherConstants = { MAX_BATCH_SIZE, MAX_RETRIES };
