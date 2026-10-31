import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');
const ingredientModal = read('./inventory/IngredientModal.tsx');
const suppliersPage = read('./purchasing/SuppliersPage.tsx');
const supplierModal = read('./purchasing/SupplierModal.tsx');

describe('management quick fixes UI contract', () => {
  it('uses purchase presentations while keeping opening stock in the base unit', () => {
    expect(ingredientModal).not.toContain('Auto-detect conversion factor');
    expect(ingredientModal).not.toContain('Fator de Conversão');
    expect(ingredientModal).toContain('Como você compra este insumo?');
    expect(ingredientModal).toContain('purchasePresentations = presentationDrafts');
    expect(ingredientModal).toContain('const quantityBase = Number(formData.initialPurchase.quantity);');
    expect(ingredientModal).toContain('O saldo inicial não é uma compra');
  });

  it('normalizes an empty document and exposes only clear supplier actions', () => {
    expect(supplierModal).toContain('cnpj: data.cnpj?.trim() || undefined');
    expect(suppliersPage).not.toContain('FileText');
    expect(suppliersPage).toContain("supplier.isActive ? 'Inativar' : 'Reativar'");
    expect(suppliersPage).toContain('role="alert"');
  });
});
