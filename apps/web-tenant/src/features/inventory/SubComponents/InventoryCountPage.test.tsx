// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ApiResponse, IngredientDTO, InventoryCountDTO, InventoryCountStatus, UnitType } from '@gestor/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { INVENTORY_API_PATHS } from '../inventory-api-contract';
import { InventoryCountPage } from './InventoryCountPage';

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      get: apiMocks.get,
      post: apiMocks.post,
    },
  };
});

const ingredient: IngredientDTO = {
  id: 'ingredient-1',
  tenantId: 'tenant-1',
  name: 'Farinha',
  unit: UnitType.UN,
  purchaseUnit: UnitType.UN,
  conversionFactor: 1,
  currentCost: 2.5,
  currentStock: 12,
  isActive: true,
  createdAt: new Date('2026-10-18T00:00:00.000Z'),
  updatedAt: new Date('2026-10-18T00:00:00.000Z'),
};

const openedCount: InventoryCountDTO = {
  id: 'count-1',
  tenantId: 'tenant-1',
  status: InventoryCountStatus.OPEN,
  openedAt: new Date('2026-10-18T00:00:00.000Z'),
  createdAt: new Date('2026-10-18T00:00:00.000Z'),
  updatedAt: new Date('2026-10-18T00:00:00.000Z'),
  items: [{
    id: 'count-item-1',
    tenantId: 'tenant-1',
    inventoryCountId: 'count-1',
    ingredientId: ingredient.id,
    theoreticalStock: 12,
    physicalStock: 12,
    adjustedQuantity: 0,
    ingredientName: ingredient.name,
    ingredientUnit: ingredient.unit,
  }],
};

function success<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

function renderPage() {
  return render(<InventoryCountPage />);
}

async function waitForIngredients() {
  await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith(INVENTORY_API_PATHS.ingredients));
}

async function startCount(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Iniciar contagem' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Finalizar contagem' }).disabled).toBe(false));
}

describe('InventoryCountPage OPEN lifecycle', () => {
  beforeEach(() => {
    apiMocks.get.mockResolvedValue(success([ingredient]));
    apiMocks.post.mockResolvedValue(success(openedCount));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('loads ingredients on mount without opening a count', async () => {
    renderPage();

    await waitForIngredients();

    expect(apiMocks.get).toHaveBeenCalledTimes(1);
    expect(apiMocks.post).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Iniciar contagem' }).disabled).toBe(false);
    expect(screen.getByDisplayValue('12').hasAttribute('disabled')).toBe(true);
  });

  it('refreshes ingredients before start without creating a count', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForIngredients();

    await user.click(screen.getByTitle('Atualizar lista de insumos'));

    await waitFor(() => expect(apiMocks.get).toHaveBeenCalledTimes(2));
    expect(apiMocks.post).not.toHaveBeenCalled();
  });

  it('starts one count explicitly and disables refresh while it is active', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitForIngredients();

    await startCount(user);

    expect(apiMocks.post).toHaveBeenCalledTimes(1);
    expect(apiMocks.post).toHaveBeenCalledWith(
      INVENTORY_API_PATHS.openCount,
      { ingredientIds: [ingredient.id] },
    );
    expect(screen.getByTitle('A atualização fica disponível após finalizar a contagem ativa').hasAttribute('disabled')).toBe(true);
    expect(screen.getByDisplayValue('12').hasAttribute('disabled')).toBe(false);
  });

  it('protects against a double start request', async () => {
    renderPage();
    await waitForIngredients();

    const startButton = screen.getByRole('button', { name: 'Iniciar contagem' });
    fireEvent.click(startButton);
    fireEvent.click(startButton);

    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledTimes(1));
  });

  it('closes once, clears the local session and reloads ingredients without reopening', async () => {
    const user = userEvent.setup();
    apiMocks.post.mockImplementation((path: string) => {
      if (path === INVENTORY_API_PATHS.openCount) return Promise.resolve(success(openedCount));
      return Promise.resolve(success({}));
    });
    renderPage();
    await waitForIngredients();
    await startCount(user);

    await user.click(screen.getByRole('button', { name: 'Finalizar contagem' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Iniciar contagem' }).disabled).toBe(false));
    expect(apiMocks.post).toHaveBeenCalledTimes(2);
    expect(apiMocks.post.mock.calls.filter(([path]) => path === INVENTORY_API_PATHS.openCount)).toHaveLength(1);
    expect(apiMocks.get).toHaveBeenCalledTimes(2);
  });

  it('keeps the OPEN session after a stale 409 without restarting it', async () => {
    const user = userEvent.setup();
    apiMocks.post.mockImplementation((path: string) => {
      if (path === INVENTORY_API_PATHS.openCount) return Promise.resolve(success(openedCount));
      return Promise.reject(new ApiError(409, 'Stale stock'));
    });
    renderPage();
    await waitForIngredients();
    await startCount(user);

    await user.click(screen.getByRole('button', { name: 'Finalizar contagem' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('O estoque mudou durante a contagem'));
    expect(screen.getByRole('button', { name: 'Finalizar contagem' }).disabled).toBe(false);
    expect(apiMocks.post.mock.calls.filter(([path]) => path === INVENTORY_API_PATHS.openCount)).toHaveLength(1);
    expect(apiMocks.get).toHaveBeenCalledTimes(1);
  });

  it('protects against a double close request', async () => {
    const user = userEvent.setup();
    let resolveClose: (() => void) | undefined;
    const closePromise = new Promise<ApiResponse<Record<string, never>>>((resolve) => {
      resolveClose = () => resolve(success({}));
    });
    apiMocks.post.mockImplementation((path: string) => (
      path === INVENTORY_API_PATHS.openCount ? Promise.resolve(success(openedCount)) : closePromise
    ));
    renderPage();
    await waitForIngredients();
    await startCount(user);

    const finishButton = screen.getByRole('button', { name: 'Finalizar contagem' });
    fireEvent.click(finishButton);
    fireEvent.click(finishButton);

    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledTimes(2));
    resolveClose?.();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Iniciar contagem' }).disabled).toBe(false));
  });
});
