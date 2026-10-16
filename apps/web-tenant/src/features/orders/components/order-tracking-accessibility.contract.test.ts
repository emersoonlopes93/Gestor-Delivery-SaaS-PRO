import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(resolve(process.cwd(), 'src/features/orders/components/OrderTrackingDialog.tsx'), 'utf8');

describe('OrderTrackingDialog accessibility contract', () => {
  it('defines labelled modal semantics and all close paths', () => {
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain('aria-labelledby="order-tracking-title"');
    expect(source).toContain("event.key === 'Escape'");
    expect(source).toContain("event.key !== 'Tab'");
    expect(source).toContain('onClick={onClose}');
  });

  it('isolates the underlying UI, locks scrolling, and restores trigger focus', () => {
    expect(source).toContain("document.body.style.overflow = 'hidden'");
    expect(source).toContain("element.setAttribute('aria-hidden', 'true')");
    expect(source).toContain('.inert = true');
    expect(source).toContain('queueMicrotask(() => restoreFocus?.focus())');
  });
});
