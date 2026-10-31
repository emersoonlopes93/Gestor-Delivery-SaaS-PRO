// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ApiResponse, RecipeBaseCostProjectionDTO, RecipeBaseDTO, RecipeBaseDetailDTO, UnitType } from '@gestor/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecipeBasesPage } from './RecipeBasesPage';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
const authMocks = vi.hoisted(() => ({ user: { permissions: ['reports.view_costs'], roles: [] as string[] } }));

vi.mock('../../../lib/api-client', () => ({ api: apiMocks }));
vi.mock('../../../hooks/use-tenant-auth', () => ({ useTenantAuth: () => ({ user: authMocks.user }) }));

const success = <T,>(data: T): ApiResponse<T> => ({ success: true, data });
const base: RecipeBaseDTO = { id: 'base-a', name: 'Creme', outputUnit: UnitType.UN, yieldQuantity: 2, isActive: true };
const detail: RecipeBaseDetailDTO = { ...base, components: [] };
const known: RecipeBaseCostProjectionDTO = {
  baseId: base.id, yieldQuantity: 2, outputUnit: UnitType.UN, coverage: 'KNOWN',
  estimatedTotalCost: 6, estimatedCostPerYieldUnit: 3,
  partialEstimatedTotalCost: null, partialEstimatedCostPerYieldUnit: null,
  knownIngredientCount: 2, unknownIngredientCount: 0, basis: 'CURRENT_INGREDIENT_COSTS',
};

describe('RecipeBasesPage cost projection', () => {
  beforeEach(() => {
    authMocks.user = { permissions: ['reports.view_costs'], roles: [] };
    apiMocks.get.mockImplementation((path: string) => {
      if (path === '/inventory/recipe-bases') return Promise.resolve(success([base]));
      if (path === '/inventory/ingredients') return Promise.resolve(success([]));
      if (path === '/inventory/recipe-bases/cost-projections') return Promise.resolve(success([known]));
      if (path === `/inventory/recipe-bases/${base.id}`) return Promise.resolve(success(detail));
      return Promise.resolve(success([]));
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows a persisted canonical projection and labels the editor value as saved data', async () => {
    const user = userEvent.setup();
    render(<RecipeBasesPage />);
    await screen.findByText((content) => content.includes('Custo estimado atual:') && content.includes('6,00') && content.includes('por lote'));
    expect(screen.getByText((content) => content.includes('3,00') && content.includes('por un de rendimento'))).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Ver / editar' }));
    await screen.findByRole('dialog');
    await user.type(screen.getByDisplayValue('Creme'), ' atualizado');
    expect(screen.getByText(/Alterações ainda não recalculadas/)).toBeDefined();
  });

  it('does not request or show costs for a session without reports.view_costs', async () => {
    authMocks.user = { permissions: [], roles: [] };
    render(<RecipeBasesPage />);
    await screen.findByText('Creme');
    await waitFor(() => expect(apiMocks.get).not.toHaveBeenCalledWith('/inventory/recipe-bases/cost-projections'));
    expect(screen.queryByText(/Custo estimado atual/)).toBeNull();
  });
});
