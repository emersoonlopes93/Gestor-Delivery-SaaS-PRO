// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OptionGroupEditorModal } from './OptionGroupEditorModal';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));

vi.mock('../../../lib/api-client', () => ({ api: apiMocks }));

const contextualLink = () => ({
  productId: 'product-1',
  pricingAxis: 'secondary' as const,
  overrides: { overrideName: 'Adicionais locais', overrideIsRequired: true, overrideMinSelect: 1, overrideMaxSelect: 2 },
  onPricingAxisChange: vi.fn(),
  onOverridesChange: vi.fn(),
});

describe('OptionGroupEditorModal contextual authoring', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('submits group, item, link rules and local availability in one contextual request', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn().mockResolvedValue(undefined);
    apiMocks.post.mockResolvedValue({
      success: true,
      data: { group: { id: 'group-1', tenantId: 'tenant-1', name: 'Adicionais', selectionType: 'multiple', isRequired: false, minSelect: 0, maxSelect: 1, isActive: true, order: 0, items: [] } },
    });
    render(<OptionGroupEditorModal isOpen onClose={vi.fn()} groupId={null} onSaved={onSaved} contextualLink={contextualLink()} />);

    await user.type(screen.getByPlaceholderText('Ex: Escolha o tamanho'), 'Adicionais');
    await user.type(screen.getByPlaceholderText('Ex: Calabresa'), 'Borda recheada');
    await user.click(screen.getByRole('checkbox', { name: /Disponível neste produto:/ }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(apiMocks.post).toHaveBeenCalledTimes(1));
    expect(apiMocks.post).toHaveBeenCalledWith(
      '/catalog/products/product-1/option-groups/contextual',
      expect.objectContaining({
        idempotencyKey: expect.any(String),
        name: 'Adicionais',
        pricingAxis: 'secondary',
        overrideName: 'Adicionais locais',
        overrideIsRequired: true,
        overrideMinSelect: 1,
        overrideMaxSelect: 2,
        items: [expect.objectContaining({ name: 'Borda recheada', productIsActive: false })],
      }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'group-1' }), true));
  });

  it('keeps the modal open and surfaces a writer error without a duplicate request', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    apiMocks.post.mockRejectedValue(new Error('Conflito de regras locais'));
    render(<OptionGroupEditorModal isOpen onClose={vi.fn()} groupId={null} onSaved={onSaved} contextualLink={contextualLink()} />);

    await user.type(screen.getByPlaceholderText('Ex: Escolha o tamanho'), 'Adicionais');
    await user.type(screen.getByPlaceholderText('Ex: Calabresa'), 'Molho extra');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect((await screen.findByRole('alert')).textContent).toContain('Conflito de regras locais');
    expect(screen.getByText('Novo grupo/tamanho')).toBeDefined();
    expect(apiMocks.post).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
  });
});
