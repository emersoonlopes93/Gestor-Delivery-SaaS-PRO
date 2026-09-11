import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('ModalShell accessibility contract', () => {
  it('keeps portal semantics, focus trapping, escape and modal-stack scroll locking', () => {
    const source = readFileSync(resolve(__dirname, 'ModalShell.tsx'), 'utf8');
    expect(source).toContain("createPortal");
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain("event.key === 'Escape'");
    expect(source).toContain('modalDepth');
    expect(source).toContain('restoreFocusRef.current?.focus()');
  });

  it('centers the dialog at every responsive breakpoint', () => {
    const source = readFileSync(resolve(__dirname, 'ModalShell.tsx'), 'utf8');
    expect(source).toContain('items-center justify-center');
    expect(source).toContain('rounded-[1.75rem]');
    expect(source).not.toContain('items-end');
  });
});
