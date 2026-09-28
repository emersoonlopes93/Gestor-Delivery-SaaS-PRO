import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./PosPage.tsx', import.meta.url), 'utf8');

describe('POS presentation contract', () => {
  it('keeps the empty cart actionable and preserves the catalog return', () => {
    expect(source).toContain('cart.length === 0 ?');
    expect(source).toContain('Adicione itens para iniciar a venda.');
    expect(source).toContain("setViewMode('catalog'); searchInputRef.current?.focus();");
  });

  it('links the disabled finish control to its current requirement explanation', () => {
    expect(source).toContain('id="pos-finish-requirement"');
    expect(source).toContain("aria-describedby={!canFinalizeSale ? 'pos-finish-requirement' : undefined}");
    expect(source).toContain('Finalizando venda…');
  });

  it('keeps the existing payload mutation and reports success only from its callback', () => {
    const mutationIndex = source.indexOf('createSale.mutate({ ...getPayload(), paymentMethod: method }');
    const successCallbackIndex = source.indexOf('onSuccess: (data) => {', mutationIndex);
    const successFeedbackIndex = source.indexOf("toast.success('Venda registrada. Verifique a impressão do comprovante.');", successCallbackIndex);

    expect(mutationIndex).toBeGreaterThan(-1);
    expect(successCallbackIndex).toBeGreaterThan(mutationIndex);
    expect(successFeedbackIndex).toBeGreaterThan(successCallbackIndex);
  });
});
