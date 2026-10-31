import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResponse } from '@gestor/types';
import { BaseMenusPage } from './BaseMenusPage';
import { api } from '../../lib/api-client';
import { useAdminPermissions } from '../../hooks/use-admin-auth';

vi.mock('../../lib/api-client', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
      this.name = 'ApiError';
    }
  },
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

const product = {
  id: 'product-1',
  categoryId: 'category-1',
  slug: 'acai-300ml',
  name: 'Açaí 300ml',
  description: 'Copo pequeno',
  basePrice: 15,
  compareAtPrice: null,
  sortOrder: 1,
  mediaLookupKey: 'lookup:acai-300',
  searchTagsJson: ['lookup:acai-300'],
  metadataJson: {
    optionGroups: [
      {
        name: 'Coberturas',
        description: '',
        selectionType: 'multiple',
        isRequired: false,
        minSelect: 0,
        maxSelect: 5,
        order: 1,
        isActive: true,
        items: [
          {
            name: 'Leite em pó',
            description: '',
            priceImpactValue: 2,
            allowQuantity: false,
            minQty: null,
            maxQty: null,
            order: 1,
            isActive: true,
          },
        ],
      },
    ],
  },
  imageStatus: 'linked_exact' as const,
  publishedGlobalImage: {
    id: 'asset-1',
    title: 'Açaí 300ml',
    publicUrl: 'https://cdn.local/acai.webp',
    altText: 'Açaí 300ml',
    filename: 'acai.webp',
    publicationStatus: 'published',
    category: 'acai',
    createdAt: '2026-06-01T00:00:00.000Z',
  },
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

function mockApis({ createDraft = false, baseMediaItems = [] as Array<Record<string, unknown>> } = {}) {
  vi.mocked(api.get).mockImplementation(<T,>(endpoint: string): Promise<ApiResponse<T>> => {
    if (endpoint === '/admin/base-menus') {
      return Promise.resolve(ok([
        {
          id: 'template-1',
          slug: 'acai',
          name: 'Açaí',
          description: 'Template de açaí',
          segment: 'acai',
          icon: 'A',
          status: 'published',
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
        },
      ]) as ApiResponse<T>);
    }

    if (endpoint === '/admin/base-menus/acai') {
      return Promise.resolve(ok({
        template: {
          id: 'template-1',
          slug: 'acai',
          name: 'Açaí',
          description: 'Template de açaí',
          segment: 'acai',
          icon: 'A',
          status: 'published',
          metadataJson: null,
          createdAt: '2026-06-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
        currentPublishedVersion: publishedVersion,
        draftVersion: createDraft ? draftVersion : null,
        totals: {
          totalCategories: 1,
          totalProducts: 1,
          totalProductsWithMediaLookupKey: 1,
          totalProductsWithPublishedGlobalImage: 1,
          totalProductsWithoutImage: 0,
        },
        categories: [category],
        versions: [],
      }) as ApiResponse<T>);
    }

    if (endpoint === '/admin/base-menus/acai/import-logs') {
      return Promise.resolve(ok([]) as ApiResponse<T>);
    }

    if (endpoint === '/admin/base-menus/acai/versions') {
      return Promise.resolve(ok([
        {
          ...draftVersion,
          templateId: 'template-1',
          isCurrentPublished: false,
          totals: { categories: 1, products: 1, linkedImages: 1, missingImages: 0, fallbackImages: 0 },
        },
        {
          ...publishedVersion,
          templateId: 'template-1',
          isCurrentPublished: true,
          totals: { categories: 1, products: 1, linkedImages: 1, missingImages: 0, fallbackImages: 0 },
        },
      ]) as ApiResponse<T>);
    }

    if (endpoint === '/admin/base-menus/acai/draft') {
      if (!createDraft) {
        return Promise.reject(Object.assign(new Error('Draft not found'), { status: 404 })) as Promise<ApiResponse<T>>;
      }
      return Promise.resolve(ok({
        template: { ...draftVersionTemplate, currentPublishedVersionId: 'version-1' },
        version: { ...draftVersion, templateId: 'template-1' },
        validation: {
          errors: [],
          warnings: [],
          totals: { categories: 1, products: 1 },
          imageSummary: { linkedExact: 1, linkedTag: 0, linkedFallback: 0, missingLookup: 0, noPublishedAsset: 0, draftOnly: 0 },
          replacingVersionId: 'version-1',
          publishingVersionId: 'version-2',
          publishingVersionNumber: 2,
        },
        categories: [category],
      }) as ApiResponse<T>);
    }

    if (endpoint.startsWith('/admin/base-media?')) {
      return Promise.resolve(ok({
        items: baseMediaItems,
        total: baseMediaItems.length,
        page: 1,
        pageSize: 24,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false,
      }) as ApiResponse<T>);
    }

    return Promise.reject(new Error(`Unhandled GET ${endpoint}`));
  });

  vi.mocked(api.post).mockImplementation(<T,>(endpoint: string, _body?: unknown): Promise<ApiResponse<T>> => {
    if (endpoint === '/admin/base-menus/acai/draft-version') {
      return Promise.resolve(ok({
        template: { ...draftVersionTemplate, currentPublishedVersionId: 'version-1' },
        version: { ...draftVersion, templateId: 'template-1' },
        validation: {
          errors: [],
          warnings: [],
          totals: { categories: 1, products: 1 },
          imageSummary: { linkedExact: 1, linkedTag: 0, linkedFallback: 0, missingLookup: 0, noPublishedAsset: 0, draftOnly: 0 },
          replacingVersionId: 'version-1',
          publishingVersionId: 'version-2',
          publishingVersionNumber: 2,
        },
        categories: [category],
      }) as ApiResponse<T>);
    }
    if (endpoint === '/admin/base-menus/acai/publish-draft') return Promise.resolve(ok({}) as ApiResponse<T>);
    if (endpoint === '/admin/base-menus/acai/discard-draft') return Promise.resolve(ok({}) as ApiResponse<T>);
    if (endpoint.includes('/products')) return Promise.resolve(ok({}) as ApiResponse<T>);
    return Promise.resolve(ok({}) as ApiResponse<T>);
  });

  vi.mocked(api.patch).mockResolvedValue(ok({}) as ApiResponse<unknown>);
  vi.mocked(api.delete).mockResolvedValue(ok({}) as ApiResponse<unknown>);
}

const draftVersionTemplate = {
  id: 'template-1',
  slug: 'acai',
  name: 'Açaí',
  description: 'Template de açaí',
  segment: 'acai',
  icon: 'A',
  status: 'published' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  setPermissions(['saas.base_menu.read', 'saas.base_menu.manage']);
});

describe('BaseMenusPage', () => {
  async function getFirstProductCard() {
    const cards = await screen.findAllByRole('article');
    return cards[0];
  }

  it('cria um draft automaticamente ao abrir o editor', async () => {
    mockApis();

    renderPage('/base-menus');

    await userEvent.click(await screen.findByRole('button', { name: 'Editar cardápio' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/base-menus/acai/draft-version'));
    expect(await screen.findByText(/Alterações não publicadas/i)).toBeInTheDocument();
  });

  it('mostra produto com imagem, preço e complementos e salva alterações', async () => {
    mockApis({ createDraft: true });

    renderPage('/base-menus/acai/draft');

    const productCard = await getFirstProductCard();
    const productScope = within(productCard);

    expect(productScope.getByText('Açaí 300ml')).toBeInTheDocument();
    expect(productScope.getByText('Imagem ok')).toBeInTheDocument();
    expect(screen.getByText(/15,00/)).toBeInTheDocument();
    expect(screen.getByText('1 grupo de complementos')).toBeInTheDocument();

    await userEvent.click(productScope.getByRole('button', { name: 'Editar' }));
    await userEvent.clear(screen.getAllByLabelText('Nome')[1]);
    await userEvent.type(screen.getAllByLabelText('Nome')[1], 'Açaí 500ml');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/admin/base-menus/acai/versions/version-2/products/product-1',
      expect.objectContaining({ name: 'Açaí 500ml', basePrice: 15 }),
    ));
  });

  it('troca a imagem do produto usando a Galeria Base', async () => {
    mockApis({
      createDraft: true,
      baseMediaItems: [
        {
          id: 'asset-2',
          title: 'Novo Açaí',
          category: 'acai',
          categoryName: 'Açaí',
          publicUrl: 'https://cdn.local/novo.webp',
          altText: 'Novo Açaí',
          tagsJson: ['lookup:acai-500'],
          publicationStatus: 'published',
          productName: 'Açaí 500ml',
          mediaLookupKey: 'lookup:acai-500',
        },
      ],
    });

    renderPage('/base-menus/acai/draft');

    const productCard = await getFirstProductCard();
    const productScope = within(productCard);

    expect(productScope.getByText('Açaí 300ml')).toBeInTheDocument();
    await userEvent.click(productScope.getByRole('button', { name: 'Trocar imagem' }));
    await userEvent.click(await screen.findByRole('button', { name: /Açaí 500ml/ }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/admin/base-menus/acai/versions/version-2/products/product-1',
      expect.objectContaining({ mediaLookupKey: 'lookup:acai-500', searchTagsJson: ['lookup:acai-500'] }),
    ));
  });

  it('adiciona complementos sem expor JSON cru e bloqueia min/max inválido pelo backend', async () => {
    mockApis({ createDraft: true });

    renderPage('/base-menus/acai/draft');

    const productCard = await getFirstProductCard();
    const productScope = within(productCard);

    expect(productScope.getByText('Açaí 300ml')).toBeInTheDocument();
    const refreshedProductScope = within(await getFirstProductCard());
    await userEvent.click(refreshedProductScope.getByRole('button', { name: 'Complementos' }));
    await userEvent.clear(screen.getAllByLabelText('Grupo')[0]);
    await userEvent.type(screen.getAllByLabelText('Grupo')[0], 'Coberturas');
    await userEvent.type(screen.getAllByLabelText('Preco adicional')[0], '2');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar complementos' }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
      '/admin/base-menus/acai/versions/version-2/products/product-1',
      expect.objectContaining({
        metadataJson: expect.objectContaining({
          optionGroups: expect.any(Array),
        }),
      }),
    ));

    vi.mocked(api.patch).mockRejectedValueOnce(Object.assign(new Error('maxSelect nao pode ser menor que minSelect.'), { status: 400 }));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined);

    const updatedProductScope = within(await getFirstProductCard());
    await userEvent.click(updatedProductScope.getByRole('button', { name: 'Complementos' }));
    await userEvent.clear(screen.getAllByLabelText('Minimo')[0]);
    await userEvent.type(screen.getAllByLabelText('Minimo')[0], '2');
    await userEvent.clear(screen.getAllByLabelText('Maximo')[0]);
    await userEvent.type(screen.getAllByLabelText('Maximo')[0], '1');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar complementos' }));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
  });

  it('exige confirmacao forte para publicar alteracoes', async () => {
    mockApis({ createDraft: true });

    renderPage('/base-menus/acai/draft');

    await userEvent.click(await screen.findByRole('button', { name: 'Publicar alterações' }));
    const publishConfirm = screen.getByRole('button', { name: 'Confirmar publicacao' });
    expect(publishConfirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Digite PUBLICAR para confirmar/), 'PUBLICAR');
    expect(publishConfirm).toBeEnabled();
    await userEvent.click(publishConfirm);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/base-menus/acai/publish-draft'));
  });

  it('exige confirmacao forte para descartar alteracoes', async () => {
    mockApis({ createDraft: true });

    renderPage('/base-menus/acai/draft');

    const discardButton = await screen.findByRole('button', { name: 'Descartar alterações' });
    await userEvent.click(discardButton);
    const discardConfirm = screen.getByRole('button', { name: 'Confirmar descarte' });
    expect(discardConfirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Digite DESCARTAR para confirmar/), 'DESCARTAR');
    expect(discardConfirm).toBeEnabled();
    await userEvent.click(discardConfirm);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/admin/base-menus/acai/discard-draft'));
  });

  it('esconde os detalhes tecnicos na aba avancada', async () => {
    mockApis({ createDraft: true });

    renderPage('/base-menus/acai');

    expect(await screen.findByRole('heading', { name: /Açaí/ })).toBeInTheDocument();
    expect(screen.queryByText('Metadados')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Mais opções' }));
    expect(screen.getByText('Metadados')).toBeInTheDocument();
    expect(screen.getByText('Versões')).toBeInTheDocument();
  });
});
