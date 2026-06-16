import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResponse } from '@gestor/types';
import { BaseMenusPage } from './BaseMenusPage';
import { api } from '../../lib/api-client';
import { useAdminPermissions } from '../../hooks/use-admin-auth';

vi.mock('../../lib/api-client', () => ({
  ApiError: class ApiError extends Error {},
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../hooks/use-admin-auth', () => ({
  useAdminPermissions: vi.fn(),
}));

type Permission = 'saas.base_menu.read' | 'saas.base_menu.manage';

const publishedVersion = {
  id: 'version-1',
  versionNumber: 1,
  status: 'published' as const,
  publishedAt: '2026-06-01T00:00:00.000Z',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  metadataJson: null,
};

const draftVersion = {
  id: 'version-2',
  versionNumber: 2,
  status: 'draft' as const,
  publishedAt: null,
  createdAt: '2026-06-02T00:00:00.000Z',
  updatedAt: '2026-06-02T00:00:00.000Z',
  metadataJson: null,
};

const templateListItem = {
  id: 'template-1',
  slug: 'acai',
  name: 'Acai',
  description: 'Template de acai',
  segment: 'acai',
  icon: 'A',
  status: 'published' as const,
  currentPublishedVersion: publishedVersion,
  draftVersion: null,
  totalCategories: 1,
  totalProducts: 1,
  totalProductsWithMediaLookupKey: 1,
  totalProductsWithPublishedGlobalImage: 1,
  totalProductsWithoutImage: 0,
  lastPublishedAt: '2026-06-01T00:00:00.000Z',
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

const product = {
  id: 'product-1',
  categoryId: 'category-1',
  slug: 'acai-300ml',
  name: 'Acai 300ml',
  description: 'Copo pequeno',
  basePrice: 15,
  compareAtPrice: null,
  sortOrder: 1,
  mediaLookupKey: 'lookup:acai-300',
  searchTagsJson: ['lookup:acai-300'],
  metadataJson: null,
  imageStatus: 'linked_exact' as const,
  publishedGlobalImage: null,
};

const category = {
  id: 'category-1',
  slug: 'tamanhos',
  name: 'Tamanhos',
  description: null,
  sortOrder: 1,
  metadataJson: null,
  products: [product],
};

function makeDetail(hasDraft: boolean) {
  return {
    template: {
      id: 'template-1',
      slug: 'acai',
      name: 'Acai',
      description: 'Template de acai',
      segment: 'acai',
      icon: 'A',
      status: 'published' as const,
      metadataJson: null,
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    },
    currentPublishedVersion: publishedVersion,
    draftVersion: hasDraft ? draftVersion : null,
    totals: {
      totalCategories: 1,
      totalProducts: 1,
      totalProductsWithMediaLookupKey: 1,
      totalProductsWithPublishedGlobalImage: 1,
      totalProductsWithoutImage: 0,
    },
    categories: [category],
    versions: [],
  };
}

function makeValidation(overrides?: Partial<{
  errors: string[];
  warnings: string[];
  linkedFallback: number;
  noPublishedAsset: number;
}>) {
  return {
    errors: overrides?.errors ?? [],
    warnings: overrides?.warnings ?? [],
    totals: { categories: 1, products: 1 },
    imageSummary: {
      linkedExact: 1,
      linkedTag: 0,
      linkedFallback: overrides?.linkedFallback ?? 0,
      missingLookup: 0,
      noPublishedAsset: overrides?.noPublishedAsset ?? 0,
      draftOnly: 0,
    },
    replacingVersionId: 'version-1',
    publishingVersionId: 'version-2',
    publishingVersionNumber: 2,
  };
}

function makeDraft(validation = makeValidation()) {
  return {
    template: { ...makeDetail(true).template, currentPublishedVersionId: 'version-1' },
    version: { ...draftVersion, templateId: 'template-1' },
    validation,
    categories: [category],
  };
}

const versions = [
  {
    ...draftVersion,
    templateId: 'template-1',
    isCurrentPublished: false,
    totals: { categories: 1, products: 1, linkedImages: 0, missingImages: 1, fallbackImages: 0 },
  },
  {
    ...publishedVersion,
    templateId: 'template-1',
    isCurrentPublished: true,
    totals: { categories: 1, products: 1, linkedImages: 1, missingImages: 0, fallbackImages: 0 },
  },
  {
    id: 'version-0',
    versionNumber: 0,
    status: 'archived' as const,
    publishedAt: '2026-05-01T00:00:00.000Z',
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    metadataJson: null,
    templateId: 'template-1',
    isCurrentPublished: false,
    totals: { categories: 1, products: 1, linkedImages: 1, missingImages: 0, fallbackImages: 0 },
  },
];

function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

function setPermissions(permissions: Permission[]) {
  vi.mocked(useAdminPermissions).mockReturnValue({
    permissions,
    has: (permission: string) => permissions.includes(permission as Permission),
    hasAny: (items: string[]) => items.some((permission) => permissions.includes(permission as Permission)),
    hasAll: (items: string[]) => items.every((permission) => permissions.includes(permission as Permission)),
  });
}

function mockApi(draft = makeDraft(), listDraft = false) {
  vi.mocked(api.get).mockImplementation(<T,>(endpoint: string): Promise<ApiResponse<T>> => {
    if (endpoint === '/admin/base-menus') return Promise.resolve(ok([{ ...templateListItem, draftVersion: listDraft ? draftVersion : null }]) as ApiResponse<T>);
    if (endpoint === '/admin/base-menus/acai') return Promise.resolve(ok(makeDetail(listDraft)) as ApiResponse<T>);
    if (endpoint === '/admin/base-menus/acai/import-logs') return Promise.resolve(ok([]) as ApiResponse<T>);
    if (endpoint === '/admin/base-menus/acai/versions') return Promise.resolve(ok(versions) as ApiResponse<T>);
    if (endpoint === '/admin/base-menus/acai/draft') return Promise.resolve(ok(draft) as ApiResponse<T>);
    return Promise.reject(new Error(`Unhandled GET ${endpoint}`));
  });
  vi.mocked(api.post).mockImplementation(<T,>(): Promise<ApiResponse<T>> => Promise.resolve(ok({}) as ApiResponse<T>));
}

function renderPage(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/base-menus" element={<BaseMenusPage />} />
        <Route path="/base-menus/:id" element={<BaseMenusPage />} />
        <Route path="/base-menus/:id/draft" element={<BaseMenusPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BaseMenusPage RBAC and draft safety', () => {
  it('hides management actions for read-only users while allowing versions view', async () => {
    setPermissions(['saas.base_menu.read']);
    mockApi(makeDraft(), true);

    renderPage('/base-menus/acai');

    expect(await screen.findByRole('heading', { name: /Acai/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Criar draft' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publicar draft' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Descartar draft' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Versoes' }));
    expect(screen.getByText(/Versoes antigas ficam como historico/)).toBeInTheDocument();
    expect(screen.getByText('current')).toBeInTheDocument();
    expect(screen.getByText('Arquivado')).toBeInTheDocument();
  });

  it('shows create and continue draft actions for manage users', async () => {
    setPermissions(['saas.base_menu.read', 'saas.base_menu.manage']);
    mockApi(makeDraft(), false);
    const { unmount } = renderPage('/base-menus');

    expect(await screen.findByRole('button', { name: 'Criar draft' })).toBeInTheDocument();

    unmount();
    mockApi(makeDraft(), true);
    renderPage('/base-menus');

    expect(await screen.findByRole('button', { name: 'Continuar edicao' })).toBeInTheDocument();
  });

  it('requires PUBLICAR before calling publish endpoint and shows safety copy', async () => {
    setPermissions(['saas.base_menu.read', 'saas.base_menu.manage']);
    mockApi(makeDraft(makeValidation({ warnings: ['Produto sem tags'], linkedFallback: 1 })), true);

    renderPage('/base-menus/acai/draft');

    await userEvent.click(await screen.findByRole('button', { name: 'Publicar draft' }));
    expect(screen.getByText(/Tenants novos passarao a importar esta nova versao/)).toBeInTheDocument();
    expect(screen.getByText(/Tenants que ja importaram versoes antigas nao serao alterados/)).toBeInTheDocument();
    expect(screen.getByText(/Esta acao nao edita cardapios reais de lojas/)).toBeInTheDocument();

    const confirmButton = screen.getByRole('button', { name: 'Confirmar publicacao do draft' });
    expect(confirmButton).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Digite PUBLICAR para confirmar/), 'ERRADO');
    expect(confirmButton).toBeDisabled();
    await userEvent.clear(screen.getByLabelText(/Digite PUBLICAR para confirmar/));
    await userEvent.type(screen.getByLabelText(/Digite PUBLICAR para confirmar/), 'PUBLICAR');
    expect(confirmButton).toBeEnabled();
    await userEvent.click(confirmButton);

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/base-menus/acai/publish-draft'));
  });

  it('blocks publishing when draft has structural errors', async () => {
    setPermissions(['saas.base_menu.read', 'saas.base_menu.manage']);
    mockApi(makeDraft(makeValidation({ errors: ['Template sem produtos.'] })), true);

    renderPage('/base-menus/acai/draft');

    expect(await screen.findByText('Bloqueado por erros')).toBeInTheDocument();
    expect(screen.getByText(/Template sem produtos/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publicar draft' })).toBeDisabled();
  });

  it('allows publishing with warnings after strong confirmation', async () => {
    setPermissions(['saas.base_menu.read', 'saas.base_menu.manage']);
    mockApi(makeDraft(makeValidation({ warnings: ['Produto sem imagem publicada.'], noPublishedAsset: 1 })), true);

    renderPage('/base-menus/acai/draft');

    expect(await screen.findByText('Publicavel com avisos')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Publicar draft' }));
    expect(screen.getAllByText(/Produto sem imagem publicada/).length).toBeGreaterThan(0);
    await userEvent.type(screen.getByLabelText(/Digite PUBLICAR para confirmar/), 'PUBLICAR');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar publicacao do draft' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/base-menus/acai/publish-draft'));
  });

  it('requires DESCARTAR before calling discard endpoint', async () => {
    setPermissions(['saas.base_menu.read', 'saas.base_menu.manage']);
    mockApi(makeDraft(), true);

    renderPage('/base-menus/acai/draft');

    await userEvent.click(await screen.findByRole('button', { name: 'Descartar draft' }));
    expect(screen.getByText(/Todas as alteracoes desta versao draft serao perdidas/)).toBeInTheDocument();
    expect(screen.getByText(/A versao publicada atual continuara ativa/)).toBeInTheDocument();
    expect(screen.getByText(/Esta acao nao altera tenants nem cardapios reais de lojas/)).toBeInTheDocument();

    const dialog = screen.getByText('Confirmar descarte').closest('section');
    expect(dialog).not.toBeNull();
    const scoped = within(dialog as HTMLElement);
    const confirmButton = scoped.getByRole('button', { name: 'Confirmar descarte do draft' });
    expect(confirmButton).toBeDisabled();
    await userEvent.type(scoped.getByLabelText(/Digite DESCARTAR para confirmar/), 'PUBLICAR');
    expect(confirmButton).toBeDisabled();
    await userEvent.clear(scoped.getByLabelText(/Digite DESCARTAR para confirmar/));
    await userEvent.type(scoped.getByLabelText(/Digite DESCARTAR para confirmar/), 'DESCARTAR');
    expect(confirmButton).toBeEnabled();
    await userEvent.click(confirmButton);

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/base-menus/acai/discard-draft'));
  });
});
