// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../../lib/api-client';
import { Step5Product } from './Step5Product';

vi.mock('../../../hooks/useTenantCapabilities', () => ({
  useTenantCapabilities: () => ({ capabilities: { actions: {} }, isLoading: false }),
}));

vi.mock('../../../lib/api-client', () => ({
  api: { get: vi.fn(), post: vi.fn() },
}));

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

function renderStep(overrides: Partial<ComponentProps<typeof Step5Product>> = {}) {
  const onNext = vi.fn();
  const onSkip = vi.fn();
  render(<Step5Product onNext={onNext} onSkip={onSkip} onPrev={vi.fn()} onMarkValid={vi.fn()} {...overrides} />);
  return { onNext, onSkip };
}

describe('Step5Product', () => {
  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    get.mockResolvedValueOnce({ success: true, data: [{ id: 'category-1', name: 'Lanches' }] });
    get.mockResolvedValueOnce({ success: true, data: [] });
  });

  afterEach(() => cleanup());

  it('allows continuing later without persisting catalog/menu completion', async () => {
    const { onNext, onSkip } = renderStep();

    await screen.findByRole('button', { name: 'Pular etapa' });
    fireEvent.click(screen.getByRole('button', { name: 'Pular etapa' }));

    expect(onSkip).toHaveBeenCalledOnce();
    expect(onNext).not.toHaveBeenCalled();
  });

  it('uses the created category id instead of an authoring sentinel', async () => {
    get.mockReset();
    get.mockResolvedValueOnce({ success: true, data: [] });
    get.mockResolvedValueOnce({ success: true, data: [] });
    post.mockResolvedValueOnce({ success: true, data: { id: 'category-new' } });
    post.mockResolvedValueOnce({ success: true, data: { id: 'product-1', name: 'Hambúrguer', basePrice: 25 } });
    renderStep();

    await screen.findByRole('button', { name: /Adicionar Produto/i });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar Produto/i }));
    fireEvent.change(screen.getByPlaceholderText('Ex: X-Bacon, Pizza Margherita...'), { target: { value: 'Hambúrguer' } });
    fireEvent.change(screen.getByPlaceholderText('Nome da categoria (ex: Lanches, Bebidas...)'), { target: { value: 'Lanches' } });
    fireEvent.change(screen.getByPlaceholderText('R$ 0,00'), { target: { value: 'R$ 25,00' } });
    fireEvent.click(screen.getByRole('button', { name: /Adicionar Produto/i }));

    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(post.mock.calls[1]?.[1]).toEqual(expect.objectContaining({ categoryId: 'category-new' }));
  });
});
