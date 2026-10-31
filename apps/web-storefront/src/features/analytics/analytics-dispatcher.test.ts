import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { AnalyticsDispatcher, createAnalyticsEvent, createAnalyticsRuntime } from './analytics-dispatcher';

const consent = { analytics: true, marketing: false, version: 'v1' } as const;

describe('analytics dispatcher', () => {
  it('validates browser events and preserves event ids across retries', async () => {
    const event = createAnalyticsEvent('product_viewed', { productId: 'product-1' }, consent, 'session_0123456789');
    const transport = vi.fn().mockRejectedValueOnce(Object.assign(new Error('busy'), { status: 503 })).mockResolvedValue({ accepted: 1, duplicates: 0, ignored: 0 });
    const dispatcher = new AnalyticsDispatcher('demo', transport, () => 0);
    dispatcher.enqueue(event);
    await dispatcher.flush();
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[0][1][0].eventId).toBe(event.eventId);
    expect(transport.mock.calls[1][1][0].eventId).toBe(event.eventId);
  });

  it('does not retry a client validation response and batches at twenty', async () => {
    const transport = vi.fn().mockRejectedValue(Object.assign(new Error('invalid'), { status: 400 }));
    const dispatcher = new AnalyticsDispatcher('demo', transport);
    for (let index = 0; index < 21; index += 1) {
      dispatcher.enqueue(createAnalyticsEvent('menu_viewed', {}, consent, `session_${index.toString().padStart(16, '0')}`));
    }
    await dispatcher.flush();
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[0][1]).toHaveLength(20);
    expect(transport.mock.calls[1][1]).toHaveLength(1);
  });

  it('keeps analytics default-deny and allows first-party analytics with marketing disabled', async () => {
    let snapshot = { analytics: false, marketing: false, version: 'v1' } as const;
    const runtime = createAnalyticsRuntime('tenant-a', () => snapshot);

    runtime.track('menu_viewed');
    await runtime.flush();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accepted: 1, duplicates: 0, ignored: 0 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    snapshot = { analytics: true, marketing: false, version: 'v1' };
    runtime.track('product_viewed', { productId: 'product-1' });
    await runtime.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { events: Array<Record<string, unknown>> };
    expect(payload.events[0]).toMatchObject({ eventName: 'product_viewed', source: 'browser', schemaVersion: 1 });
    expect(payload.events[0]).not.toHaveProperty('tenantId');
    expect(payload.events[0]).not.toHaveProperty('visitorId');
    expect(payload.events[0].consent).toEqual({ analytics: true, marketing: false, version: 'v1' });
    vi.unstubAllGlobals();
  });

  it('drops queued events and the tenant session on revocation', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ accepted: 1, duplicates: 0, ignored: 0 }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const runtime = createAnalyticsRuntime('tenant-a', () => consent);
    runtime.track('menu_viewed');
    runtime.revoke();
    await runtime.flush();
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
