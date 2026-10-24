import { describe, expect, it, vi } from 'vitest';
import { DeliveryCoverageCompletion } from './deliveryCoverageCompletion';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function fixture() {
  const calls: string[] = [];
  const markStep = vi.fn(async () => { calls.push('mark'); });
  const revalidate = vi.fn(async () => { calls.push('revalidate'); });
  const advance = vi.fn(() => { calls.push('advance'); });
  const onStatus = vi.fn((status: 'saving' | 'saved' | 'error') => { calls.push(`status:${status}`); });
  const completion = new DeliveryCoverageCompletion({ markStep, revalidate, advance, onStatus });
  const persist = vi.fn(async () => { calls.push('put'); });
  return { calls, markStep, revalidate, advance, onStatus, completion, persist };
}

describe('delivery coverage completion', () => {
  it('persists, marks, revalidates, then advances in canonical order', async () => {
    const flow = fixture();

    await expect(flow.completion.submit(flow.persist)).resolves.toBe(true);

    expect(flow.calls).toEqual(['status:saving', 'put', 'mark', 'revalidate', 'advance', 'status:saved']);
    expect(flow.persist).toHaveBeenCalledTimes(1);
    expect(flow.markStep).toHaveBeenCalledTimes(1);
    expect(flow.revalidate).toHaveBeenCalledTimes(1);
    expect(flow.advance).toHaveBeenCalledTimes(1);
  });

  it('surfaces revalidation failure and retries only the pending revalidation', async () => {
    const flow = fixture();
    flow.revalidate.mockRejectedValueOnce(new Error('network unavailable'));

    await expect(flow.completion.submit(flow.persist)).resolves.toBe(false);
    expect(flow.advance).not.toHaveBeenCalled();
    expect(flow.calls).toEqual(['status:saving', 'put', 'mark', 'status:error']);
    expect(flow.revalidate).toHaveBeenCalledTimes(1);

    await expect(flow.completion.submit(flow.persist)).resolves.toBe(true);
    expect(flow.persist).toHaveBeenCalledTimes(1);
    expect(flow.markStep).toHaveBeenCalledTimes(1);
    expect(flow.revalidate).toHaveBeenCalledTimes(2);
    expect(flow.advance).toHaveBeenCalledTimes(1);
  });

  it('does not revalidate or advance when marking the official step fails', async () => {
    const flow = fixture();
    flow.markStep.mockRejectedValueOnce(new Error('step unavailable'));

    await expect(flow.completion.submit(flow.persist)).resolves.toBe(false);
    expect(flow.revalidate).not.toHaveBeenCalled();
    expect(flow.advance).not.toHaveBeenCalled();

    await expect(flow.completion.submit(flow.persist)).resolves.toBe(true);
    expect(flow.persist).toHaveBeenCalledTimes(1);
    expect(flow.markStep).toHaveBeenCalledTimes(2);
    expect(flow.revalidate).toHaveBeenCalledTimes(1);
    expect(flow.advance).toHaveBeenCalledTimes(1);
  });

  it('coalesces double submit into one active operation', async () => {
    const flow = fixture();
    const persistDeferred = deferred<void>();
    flow.persist.mockImplementationOnce(async () => {
      flow.calls.push('put');
      await persistDeferred.promise;
    });

    const first = flow.completion.submit(flow.persist);
    const second = flow.completion.submit(flow.persist);
    expect(second).toBe(first);
    expect(flow.persist).toHaveBeenCalledTimes(1);

    persistDeferred.resolve();
    await expect(first).resolves.toBe(true);
    expect(flow.markStep).toHaveBeenCalledTimes(1);
    expect(flow.revalidate).toHaveBeenCalledTimes(1);
    expect(flow.advance).toHaveBeenCalledTimes(1);
  });
});
