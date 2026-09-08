import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('inventory and purchasing UX contract', () => {
  const inventory = read('./inventory/InventoryPage.tsx');
  const movements = read('./inventory/SubComponents/MovementsTable.tsx');
  const losses = read('./inventory/SubComponents/LossesPage.tsx');
  const counts = read('./inventory/SubComponents/InventoryCountPage.tsx');
  const purchases = read('./purchasing/PurchasesPage.tsx');
  const purchaseModal = read('./purchasing/PurchaseModal.tsx');
  const suppliers = read('./purchasing/SuppliersPage.tsx');
  const registry = read('../navigation/navigationRegistry.ts');
  const app = read('../App.tsx');

  it('keeps the four real inventory areas accessible without changing their data paths', () => {
    expect(inventory).toContain("type InventoryTab = 'ingredients' | 'movements' | 'losses' | 'counts'");
    expect(inventory).toContain('role="tablist"');
    expect(inventory).toContain('role="tab"');
    expect(inventory).toContain('role="tabpanel"');
    expect(inventory).toContain('aria-controls={`inventory-panel-${tab.id}`}');
    expect(inventory).toContain('aria-labelledby={`inventory-tab-${activeTab}`}');
    expect(inventory).toContain("api.get<IngredientDTO[]>('/inventory/ingredients')");
    expect(inventory).toContain("api.get<InventorySummary>('/inventory/ingredients/summary')");
    expect(movements).toContain('/inventory/movements');
    expect(losses).toContain('INVENTORY_API_PATHS.losses');
    expect(counts).toContain('createInventoryCountSubmission(items)');
    expect((inventory.match(/api\.get/g) ?? [])).toHaveLength(2);
    expect((movements.match(/api\.get/g) ?? [])).toHaveLength(1);
  });

  it('keeps stable contextual destinations, guards and breadcrumbs intact', () => {
    const supplyLinks = "['inventory.home', 'management.purchases', 'management.suppliers']";
    expect(purchases).toContain(supplyLinks);
    expect(suppliers).toContain(supplyLinks);
    expect(registry).toContain("id: 'inventory.home'");
    expect(registry).toContain("path: '/inventory'");
    expect(registry).toContain("permission: 'inventory.read', module: 'inventory'");
    expect(registry).toContain("id: 'management.purchases'");
    expect(registry).toContain("path: '/management/purchases'");
    expect(registry).toContain("id: 'management.suppliers'");
    expect(registry).toContain("path: '/management/suppliers'");
    expect(registry).toContain("permission: 'purchasing.read', module: 'purchasing', parentId: 'inventory.home'");
    expect(app).toContain('path="/inventory"');
    expect(app).toContain('path="/management/purchases"');
    expect(app).toContain('path="/management/suppliers"');
    expect(app).toContain('<ModuleGate module="purchasing">');
  });

  it('keeps the Nova Compra modal client contract and no-new-fetch boundary intact', () => {
    expect(purchases).toContain("api.get<PurchaseDTO[]>('/purchasing/purchases')");
    expect(purchases).toContain("api.post('/purchasing/purchases', data)");
    expect((purchases.match(/api\.get/g) ?? [])).toHaveLength(1);
    expect((purchases.match(/api\.post/g) ?? [])).toHaveLength(1);
    expect(purchases).toContain('Nova Compra');
    expect(purchaseModal).toContain("api.get<SupplierDTO[]>('/purchasing/suppliers')");
    expect(purchaseModal).toContain("api.get<IngredientDTO[]>('/inventory/ingredients')");
    expect(purchaseModal).toContain('onSave: (data: CreatePurchaseDTO) => Promise<void>');
    expect(purchaseModal).toContain('handleSubmit(onSave)');
    expect(purchaseModal).toContain("name: \"items\"");
    expect(purchaseModal).toContain("register('supplierId', { required: true })");
    expect(purchaseModal).toContain("register('paymentStatus')");
    expect(purchaseModal).toContain("register('purchaseDate')");
    expect((purchaseModal.match(/api\.get/g) ?? [])).toHaveLength(2);
  });

  it('keeps mobile and assistive-technology controls available', () => {
    expect(purchases).toContain('bottom-[max(0.75rem,env(safe-area-inset-bottom))]');
    expect(purchases).toContain('fixed inset-x-4');
    expect(purchases).toContain('md:hidden');
    expect(purchases).toContain('md:flex');
    expect(inventory).toContain('htmlFor="inventory-ingredient-search"');
    expect(inventory).toContain('aria-label={`Editar insumo ${ing.name}`}');
    expect(purchases).toContain('htmlFor="purchases-search"');
    expect(suppliers).toContain('htmlFor="suppliers-search"');
    expect(suppliers).toContain("supplier.cnpj || 'Não informado'");
    expect(suppliers).toContain('Sem contato informado');
    expect(suppliers).toContain('role="alert"');
    expect(purchases).toContain('overflow-x-auto');
    expect(suppliers).toContain('overflow-x-auto');
  });
});
