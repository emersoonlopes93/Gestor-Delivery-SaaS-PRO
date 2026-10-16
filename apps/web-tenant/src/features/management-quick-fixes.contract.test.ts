import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const ingredientModal = read('./inventory/IngredientModal.tsx');
const suppliersPage = read('./purchasing/SuppliersPage.tsx');
const supplierModal = read('./purchasing/SupplierModal.tsx');

describe('management quick fixes UI contract', () => {
  it('keeps a typed conversion factor under user control and validates positive values', () => {
    expect(ingredientModal).not.toContain('Auto-detect conversion factor');
    expect(ingredientModal).toContain("conversionFactor: e.target.value === '' ? undefined : Number(e.target.value)");
    expect(ingredientModal).toContain('min="0.0001"');
    expect(ingredientModal).toContain('Informe um fator de conversão maior que zero.');
  });

  it('normalizes an empty document and exposes only clear supplier actions', () => {
    expect(supplierModal).toContain('cnpj: data.cnpj?.trim() || undefined');
    expect(suppliersPage).not.toContain('FileText');
    expect(suppliersPage).toContain("supplier.isActive ? 'Inativar' : 'Reativar'");
    expect(suppliersPage).toContain('role="alert"');
  });
});
