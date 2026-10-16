import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

describe('optional base menu import capability contract', () => {
  it('does not mount the onboarding template picker while the action is OFF', () => {
    const productStep = source('./steps/Step5Product.tsx');
    expect(productStep).toContain("capabilities?.actions?.['baseMenu.import']?.enabled === true");
    expect(productStep).toContain("importMode === 'choose' && baseMenuImportEnabled");
    expect(productStep).toContain('Adicionar Produto');
  });

  it('keeps selection separate from the explicit import action and business segment', () => {
    const importStep = source('./steps/Step5ImportMenu.tsx');
    expect(importStep).toContain("setPhase('confirm')");
    expect(importStep).toContain('handleStartImport()');
    expect(importStep).toContain('importInFlightRef.current');
    expect(importStep).not.toContain("api.patch('/tenant/settings'");
  });

  it('hides post-onboarding entry points and avoids template fetches while OFF', () => {
    const settings = source('../settings/SettingsPage.tsx');
    const products = source('../catalog/ProductsPage.tsx');
    const importPage = source('../settings/MenuImportPage.tsx');
    expect(settings).toContain('baseMenuImportEnabled &&');
    expect(products).toContain('baseMenuImportEnabled &&');
    expect(importPage).toContain('if (baseMenuImportEnabled)');
    expect(importPage).toContain('Cardapio base indisponivel');
  });
});
