// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ApiResponse, IngredientDTO, ProductRecipeDTO, RecipeBaseDTO, UnitType } from '@gestor/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecipeModal } from './RecipeModal';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
const authMock = vi.hoisted(() => ({ user: { permissions: [] as string[], roles: [] as string[] } }));

vi.mock('../../lib/api-client', () => ({ api: apiMocks }));
vi.mock('../../hooks/use-tenant-auth', () => ({ useTenantAuth: () => authMock }));

const success = <T,>(data: T): ApiResponse<T> => ({ success: true, data });

const ingredient = (id: string, name: string): IngredientDTO => ({
  id, tenantId: 'tenant-1', name, unit: UnitType.UN, conversionFactor: 1, currentCost: 2, currentStock: 0,
  isActive: true, createdAt: new Date(), updatedAt: new Date(),
});

const base = (id: string, name: string): RecipeBaseDTO => ({
  id, name, outputUnit: UnitType.UN, yieldQuantity: 1, isActive: true,
});

const recipe: ProductRecipeDTO = { productId: 'product-1', components: [], totalEstimatedCost: 0 };

describe('RecipeModal explicit component picker', () => {
  beforeEach(() => {
    apiMocks.get.mockImplementation((path: string) => {
      if (path === '/inventory/ingredients') return Promise.resolve(success([ingredient('ingredient-1', 'Insumo um'), ingredient('ingredient-3', 'Insumo três')]));
      if (path === '/inventory/recipe-bases') return Promise.resolve(success([base('base-1', 'Base um'), base('base-2', 'Base dois')]));
      return Promise.resolve(success(recipe));
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    authMock.user = { permissions: [], roles: [] };
  });

  it('adds the ingredient and base explicitly chosen by the tenant, never the first available item', async () => {
    const user = userEvent.setup();
    render(<RecipeModal isOpen onClose={vi.fn()} entityType="product" entityId="product-1" entityName="Produto" />);

    await screen.findByRole('button', { name: '+ Adicionar insumo' });
    await user.click(screen.getByRole('button', { name: '+ Adicionar insumo' }));
    await user.click(screen.getByRole('button', { name: /Insumo três/ }));
    await waitFor(() => expect(screen.getByText('Insumo três')).toBeDefined());
    expect(screen.queryByText('Insumo um')).toBeNull();

    await user.click(screen.getByRole('button', { name: '+ Adicionar preparação' }));
    await user.click(screen.getByRole('button', { name: /Base dois/ }));
    await waitFor(() => expect(screen.getByText('Base dois')).toBeDefined());
    expect(screen.queryByText('Base um')).toBeNull();
    expect(apiMocks.post).not.toHaveBeenCalled();
  });

  it('renders the picker in a portal and lets Escape close it without closing the recipe', async () => {
    const user = userEvent.setup();
    render(<RecipeModal isOpen onClose={vi.fn()} entityType="product" entityId="product-1" entityName="Produto" />);
    await user.click(await screen.findByRole('button', { name: '+ Adicionar insumo' }));
    expect(screen.getByRole('dialog', { name: 'Selecionar insumo' })).toBeDefined();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Selecionar insumo' })).toBeNull());
    expect(screen.getByRole('dialog', { name: 'Ficha Técnica' })).toBeDefined();
  });

  it('uses the contextual read-only preview endpoint for an option-item draft', async () => {
    authMock.user = { permissions: ['reports.view_costs'], roles: [] };
    apiMocks.post.mockResolvedValue(success({ coverage: 'KNOWN', estimatedTotalCost: 3, partialEstimatedTotalCost: null, knownIngredientCount: 1, unknownIngredientCount: 0, basis: 'CURRENT_INGREDIENT_COSTS' }));
    render(<RecipeModal isOpen onClose={vi.fn()} entityType="product" entityId="product-1" entityName="Produto" optionItemId="option-1" optionItemName="Adicional" />);
    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledWith('/inventory/recipes/product/product-1/option-item/option-1/preview-cost', []));
  });
});
