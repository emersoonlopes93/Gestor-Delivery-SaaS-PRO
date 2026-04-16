import React, { useMemo, useState, useEffect } from 'react';
import { api } from '../../lib/api-client';
import { CatalogPublication, Product, ProductCategory, CreateProductDto } from '@gestor/types';
import { RecipeModal } from '../inventory/RecipeModal';
import { Modal } from '../../components/Modal';
import { PermissionGate } from '../../components/PermissionGate';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, Pencil, Trash2, FileText, Search, ChevronDown, Layers, Send, EyeOff, HelpCircle, X } from 'lucide-react';

type ProductsViewMode = 'all' | 'grouped';

type ProductStatusFilter = 'all' | 'active' | 'inactive';
type ProductTypeFilter = 'all' | 'simple' | 'configurable';
type PublicationFilter = 'all' | 'draft' | 'published';
type OperationalFilter = 'all' | 'active' | 'hidden' | 'sold_out_manual' | 'inactive';

export function ProductsPage() {
  type ProductWithPublication = Product & { publication?: CatalogPublication | null };

  const [products, setProducts] = useState<ProductWithPublication[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [recipeTarget, setRecipeTarget] = useState<{ id: string, name: string } | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ProductsViewMode>('all');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<ProductTypeFilter>('all');
  const [publicationFilter, setPublicationFilter] = useState<PublicationFilter>('all');
  const [operationalFilter, setOperationalFilter] = useState<OperationalFilter>('all');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [showStatusHelp, setShowStatusHelp] = useState(false);
  const tableScrollRef = React.useRef<HTMLDivElement | null>(null);
  const [tableScrollTop, setTableScrollTop] = useState(0);
  
  // CRUD State (Unused since V2 consolidation, using redirection to EditorV2 instead)
  // const [isModalOpen, setIsModalOpen] = useState(false);
  // const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const selectedCategoryId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const categoryId = params.get('categoryId');
    return categoryId && categoryId.trim().length > 0 ? categoryId : null;
  }, [location.search]);

  const categoriesById = useMemo(() => {
    const map = new Map<string, ProductCategory>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  const filteredProducts = useMemo(() => {
    let list = products.filter((p) => (p.type ?? 'simple') !== 'combo');

    if (selectedCategoryId === '__uncategorized__') {
      list = list.filter((p) => !p.categoryId);
    } else if (selectedCategoryId) {
      list = list.filter((p) => (p.categoryId || null) === selectedCategoryId);
    }

    const q = searchTerm.trim().toLowerCase();
    if (q.length > 0) {
      list = list.filter((p) => {
        const categoryName = p.categoryId ? (categoriesById.get(p.categoryId)?.name ?? '') : '';
        return (
          (p.name ?? '').toLowerCase().includes(q) ||
          (p.shortDescription ?? '').toLowerCase().includes(q) ||
          categoryName.toLowerCase().includes(q)
        );
      });
    }

    if (statusFilter !== 'all') {
      const mustBeActive = statusFilter === 'active';
      list = list.filter((p) => Boolean(p.isActive) === mustBeActive);
    }

    if (typeFilter !== 'all') {
      list = list.filter((p) => (p.type ?? 'simple') === typeFilter);
    }

    if (publicationFilter !== 'all') {
      list = list.filter((p) => (p as any)?.publication?.publicationStatus === publicationFilter);
    }

    if (operationalFilter !== 'all') {
      list = list.filter((p) => (p as any)?.publication?.operationalStatus === operationalFilter);
    }

    return [...list].sort((a, b) => {
      const aOrder = a.order ?? 0;
      const bOrder = b.order ?? 0;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'pt-BR');
    });
  }, [products, selectedCategoryId, searchTerm, statusFilter, typeFilter, publicationFilter, operationalFilter, categoriesById]);

  const productsGroupedByCategory = useMemo(() => {
    const categoryOrder = new Map<string, number>();
    for (const c of categories) {
      categoryOrder.set(c.id, c.order);
    }

    const grouped = new Map<string, Product[]>();
    for (const product of filteredProducts) {
      const key = product.categoryId ?? '__uncategorized__';
      const arr = grouped.get(key);
      if (arr) {
        arr.push(product);
      } else {
        grouped.set(key, [product]);
      }
    }

    const sortedKeys = Array.from(grouped.keys()).sort((a, b) => {
      const aOrder = a === '__uncategorized__' ? Number.MAX_SAFE_INTEGER : (categoryOrder.get(a) ?? 0);
      const bOrder = b === '__uncategorized__' ? Number.MAX_SAFE_INTEGER : (categoryOrder.get(b) ?? 0);
      return aOrder - bOrder;
    });

    return sortedKeys.map((key) => {
      const category = key === '__uncategorized__' ? null : categories.find((c) => c.id === key) ?? null;
      const items = grouped.get(key) ?? [];
      return { key, category, products: items };
    });
  }, [categories, filteredProducts]);

  const setCategoryFilter = (categoryId: string | null) => {
    const params = new URLSearchParams(location.search);
    if (!categoryId) {
      params.delete('categoryId');
    } else {
      params.set('categoryId', categoryId);
    }
    const query = params.toString();
    navigate({ pathname: location.pathname, search: query ? `?${query}` : '' }, { replace: true });
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [prodRes, catRes] = await Promise.all([
        api.get<ProductWithPublication[]>('/catalog/products'),
        api.get<ProductCategory[]>('/catalog/categories')
      ]);
      
      if (prodRes.success) setProducts(prodRes.data);
      if (catRes.success) setCategories(catRes.data);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // CRUD operations now occur in ProductV2EditorPage
  /*
  const handleOpenModal = (product?: Product) => { ... }
  const handleSave = async () => { ... }
  */

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir este produto? (Ficará inativo no sistema)')) return;
    try {
      await api.delete(`/catalog/products/${id}`);
      loadData();
    } catch (error) {
      console.error('Erro ao excluir produto:', error);
    }
  };

  const handleTogglePublication = async (product: ProductWithPublication) => {
    try {
      const nextStatus = product.publication?.publicationStatus === 'published' ? 'draft' : 'published';
      await api.patch(`/catalog/products/${product.id}/publication`, { publicationStatus: nextStatus });
      loadData();
    } catch (error) {
      console.error('Erro ao alterar publicação:', error);
    }
  };

  const handleToggleOperational = async (product: ProductWithPublication) => {
    try {
      const nextStatus = product.publication?.operationalStatus === 'active' ? 'inactive' : 'active';
      await api.patch(`/catalog/products/${product.id}/publication`, { operationalStatus: nextStatus });
      loadData();
    } catch (error) {
      console.error('Erro ao alterar status operacional:', error);
    }
  };

  const handleToggleActive = async (product: Product) => {
    try {
      const next = !product.isActive;

      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, isActive: next } : p)));

      const payload: Partial<CreateProductDto> = {
        isActive: next,
      };
      await api.patch(`/catalog/products/${product.id}`, payload);
    } catch (error) {
      console.error('Erro ao alterar status do produto:', error);
      loadData();
    }
  };

  const toggleGroupExpanded = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  };

  const formatMoney = (value: unknown) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value ?? 0));
  };

  const renderRows = (list: ProductWithPublication[]) => {
    return list.map((product) => {
      const categoryName = product.categoryId ? (categoriesById.get(product.categoryId)?.name ?? 'Sem Categoria') : 'Sem Categoria';
      const typeMap: Record<string, string> = {
        simple: 'Individual',
        configurable: 'Personalizado',
        combo: 'Combo'
      };
      const typeLabel = typeMap[product.type ?? 'simple'] || 'Produto';
      const pub = (product as ProductWithPublication).publication;
      const pubLabel = pub ? pub.publicationStatus : null;
      const opLabel = pub ? pub.operationalStatus : null;
      return (
        <tr key={product.id} className="hover:bg-gray-50/60 transition-colors group" style={{ height: 64 }}>
          <td className="px-6 py-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-lg bg-gray-50 border border-gray-100 overflow-hidden shrink-0">
                {product.image ? (
                  <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-300 text-[10px] font-black uppercase tracking-widest">
                    IMG
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <div className="font-bold text-gray-900 truncate">{product.name}</div>
                <div className="text-xs text-gray-500 truncate hidden sm:block">{product.shortDescription || 'Sem descrição'}</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors ${product.type === 'combo' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-gray-100 text-gray-700 border-gray-200'}`}>
                    {typeLabel}
                  </span>
                  {pubLabel ? (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${pubLabel === 'published' ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                      {pubLabel}
                    </span>
                  ) : null}
                  {opLabel ? (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${opLabel === 'active' ? 'bg-green-100 text-green-700 border border-green-200' : opLabel === 'inactive' ? 'bg-gray-200 text-gray-700 border border-gray-300' : opLabel === 'hidden' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
                      {opLabel}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </td>

          <td className="px-6 py-2 text-sm text-gray-600 font-medium hidden lg:table-cell">
            {categoryName}
          </td>

          <td className="px-6 py-2 text-sm font-black text-gray-900 whitespace-nowrap">
            {formatMoney(product.basePrice)}
          </td>

          <td className="px-6 py-2 text-sm whitespace-nowrap">
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${product.isActive ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-red-100 text-red-700 border border-red-200'}`}>
              {product.isActive ? 'Ativo' : 'Inativo'}
            </span>
          </td>

          <td className="px-6 py-2 text-sm text-right">
            <div className="flex justify-end gap-1.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => setRecipeTarget({ id: product.id, name: product.name })}
                className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
                title="Ficha técnica"
                type="button"
              >
                <FileText size={16} />
              </button>
              <button
                onClick={() => navigate(`/catalog/products/${product.id}/v2`)}
                className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
                title="Editar"
                type="button"
              >
                <Pencil size={16} />
              </button>
              {/* Botão Editor V2 removido pois agora é o botão principal de editar */}
              <PermissionGate permission="catalog.publish" fallback={null}>
                <button
                  onClick={() => handleTogglePublication(product)}
                  className={`p-2 rounded-lg transition-all ${product.publication?.publicationStatus === 'published' ? 'text-green-600 hover:text-green-700 hover:bg-green-50' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'}`}
                  title={product.publication?.publicationStatus === 'published' ? 'Despublicar' : 'Publicar'}
                  type="button"
                >
                  {product.publication?.publicationStatus === 'published' ? <Send size={16} /> : <EyeOff size={16} />}
                </button>
              </PermissionGate>
              <PermissionGate permission="catalog.publish" fallback={null}>
                <button
                  onClick={() => handleToggleOperational(product)}
                  className={`p-2 rounded-lg transition-all ${product.publication?.operationalStatus === 'active' ? 'text-green-600 hover:text-green-700 hover:bg-green-50' : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'}`}
                  title={product.publication?.operationalStatus === 'active' ? 'Ocultar' : 'Exibir'}
                  type="button"
                >
                  {product.publication?.operationalStatus === 'active' ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </PermissionGate>
              <button
                onClick={() => handleToggleActive(product)}
                className={`p-2 rounded-lg transition-all ${product.isActive ? 'text-gray-400 hover:text-amber-700 hover:bg-amber-50' : 'text-gray-400 hover:text-green-700 hover:bg-green-50'}`}
                title={product.isActive ? 'Desativar' : 'Ativar'}
                type="button"
              >
                <Eye size={16} />
              </button>
              <button
                onClick={() => handleDelete(product.id)}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                title="Excluir"
                type="button"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </td>
        </tr>
      );
    });
  };

  const ROW_HEIGHT = 64;
  const OVERSCAN = 8;

  const virtualAll = useMemo(() => {
    const total = filteredProducts.length;
    const container = tableScrollRef.current;
    const viewportHeight = container?.clientHeight ?? 0;
    const startIndex = Math.max(0, Math.floor(tableScrollTop / ROW_HEIGHT) - OVERSCAN);
    const visibleCount = viewportHeight > 0 ? Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2 : total;
    const endExclusive = Math.min(total, startIndex + visibleCount);
    const topSpacer = startIndex * ROW_HEIGHT;
    const bottomSpacer = Math.max(0, (total - endExclusive) * ROW_HEIGHT);
    return {
      startIndex,
      endExclusive,
      topSpacer,
      bottomSpacer,
      totalHeight: total * ROW_HEIGHT,
    };
  }, [filteredProducts.length, tableScrollTop]);

  useEffect(() => {
    const el = tableScrollRef.current;
    if (!el) return;

    let raf = 0;
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setTableScrollTop(el.scrollTop);
      });
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    setTableScrollTop(el.scrollTop);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      el.removeEventListener('scroll', onScroll);
    };
  }, [viewMode]);

  return (
    <div className="p-6 max-w-7xl mx-auto text-left">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Produtos</h1>
          <p className="text-gray-500 mt-1">Gerencie itens vendáveis. Combos têm fluxo próprio no módulo de Combos.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
            <button
              onClick={() => setViewMode('all')}
              className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg transition-colors ${viewMode === 'all' ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}
              type="button"
            >
              Lista Completa
            </button>
            <button
              onClick={() => setViewMode('grouped')}
              className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg transition-colors ${viewMode === 'grouped' ? 'bg-primary-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}
              type="button"
            >
              Visualizar por Categoria
            </button>
          </div>

          <select
            value={selectedCategoryId ?? ''}
            onChange={(e) => setCategoryFilter(e.target.value ? e.target.value : null)}
            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 shadow-sm"
          >
            <option value="">Todas as categorias</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="__uncategorized__">Sem categoria</option>
          </select>
          
          <button
            onClick={() => navigate('/catalog/simulation')}
            className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-5 py-2.5 rounded-xl font-bold shadow-sm transition-all flex items-center gap-2"
            type="button"
          >
            <span>🍕</span> Simulador
          </button>
          
          <button
            onClick={() => navigate('/catalog/products/new/v2')}
            className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-primary-200 transition-all flex items-center gap-2"
            type="button"
          >
            <span>🍔</span> Novo Produto
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        {[
          { id: 'all', label: 'Todos' },
          { id: 'simple', label: 'Individuais' },
          { id: 'configurable', label: 'Personalizados' }
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTypeFilter(t.id as ProductTypeFilter)}
            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${typeFilter === t.id ? 'bg-white border-primary-600 text-primary-600 shadow-sm ring-1 ring-primary-600' : 'bg-gray-100 border-transparent text-gray-500 hover:bg-gray-200'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 outline-none text-sm font-medium transition-all focus:bg-white"
              placeholder="Buscar por nome, ingrediente ou categoria..."
              type="text"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedCategoryId ?? ''}
              onChange={(e) => setCategoryFilter(e.target.value ? e.target.value : null)}
              className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-700 focus:bg-white outline-none"
            >
              <option value="">Todas as categorias</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="__uncategorized__">Sem categoria</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as ProductStatusFilter)}
              className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-700"
            >
              <option value="all">Todos os status</option>
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
            </select>
            {/* Filtro de tipo removido daqui e movido para pills acima */}
            <select
              value={publicationFilter}
              onChange={(e) => setPublicationFilter(e.target.value as PublicationFilter)}
              className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-700"
            >
              <option value="all">Todas publicações</option>
              <option value="draft">Draft</option>
              <option value="published">Publicado</option>
            </select>
            <select
              value={operationalFilter}
              onChange={(e) => setOperationalFilter(e.target.value as OperationalFilter)}
              className="px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-700"
            >
              <option value="all">Todas operações</option>
              <option value="active">Active</option>
              <option value="hidden">Hidden</option>
              <option value="sold_out_manual">Sold out</option>
              <option value="inactive">Inactive</option>
            </select>
            <button
              type="button"
              onClick={() => setShowStatusHelp(true)}
              className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-all"
              title="Ajuda sobre status"
            >
              <HelpCircle size={16} />
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-gray-500 font-bold">
          <div>
            {filteredProducts.length} produto(s)
          </div>
          <div className="hidden md:flex items-center gap-2">
            <span>Ações ficam visíveis ao passar o mouse</span>
            <button
              type="button"
              onClick={() => setShowStatusHelp(true)}
              className="text-gray-400 hover:text-primary-600 transition-colors"
              title="Ajuda sobre status"
            >
              <HelpCircle size={14} />
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <>
          {viewMode === 'all' ? (
            <>
              <div className="space-y-3 md:hidden">
                {filteredProducts.map((product) => {
                  const categoryName = product.categoryId ? (categoriesById.get(product.categoryId)?.name ?? 'Sem Categoria') : 'Sem Categoria';
                  const typeLabel = product.type ?? 'simple';
                  const pub = (product as ProductWithPublication).publication;
                  const pubLabel = pub ? pub.publicationStatus : null;
                  const opLabel = pub ? pub.operationalStatus : null;
                  return (
                    <div key={product.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-black text-gray-900 truncate">{product.name}</div>
                          <div className="text-xs text-gray-500 font-bold mt-1 truncate">{categoryName}</div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-gray-100 text-gray-700 border border-gray-200">
                              {typeLabel}
                            </span>
                            {pubLabel ? (
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${pubLabel === 'published' ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}
                              >
                                {pubLabel}
                              </span>
                            ) : null}
                            {opLabel ? (
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${opLabel === 'active' ? 'bg-green-100 text-green-700 border border-green-200' : opLabel === 'inactive' ? 'bg-gray-200 text-gray-700 border border-gray-300' : opLabel === 'hidden' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-red-100 text-red-700 border border-red-200'}`}
                              >
                                {opLabel}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs text-gray-500 font-bold">Preço</div>
                          <div className="text-sm font-black text-gray-900">{formatMoney(product.basePrice)}</div>
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setRecipeTarget({ id: product.id, name: product.name })}
                          className="px-3 py-2 text-xs font-black text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200"
                          title="Ficha técnica"
                          type="button"
                        >
                          Ficha
                        </button>
                        <button
                          onClick={() => navigate(`/catalog/products/${product.id}/v2`)}
                          className="px-3 py-2 text-xs font-black text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-xl border border-primary-200"
                          title="Editar"
                          type="button"
                        >
                          Editar
                        </button>
                        {/* Botão Editor V2 removido pois agora é o botão principal de editar */}
                        <button
                          onClick={() => handleToggleActive(product)}
                          className="px-3 py-2 text-xs font-black text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200"
                          title={product.isActive ? 'Desativar' : 'Ativar'}
                          type="button"
                        >
                          {product.isActive ? 'Desativar' : 'Ativar'}
                        </button>
                        <PermissionGate permission="catalog.publish" fallback={null}>
                          <button
                            onClick={() => handleTogglePublication(product)}
                            className="px-3 py-2 text-xs font-black text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200"
                            title={product.publication?.publicationStatus === 'published' ? 'Despublicar' : 'Publicar'}
                            type="button"
                          >
                            {product.publication?.publicationStatus === 'published' ? 'Despublicar' : 'Publicar'}
                          </button>
                        </PermissionGate>
                        <PermissionGate permission="catalog.publish" fallback={null}>
                          <button
                            onClick={() => handleToggleOperational(product)}
                            className="px-3 py-2 text-xs font-black text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-200"
                            title={product.publication?.operationalStatus === 'active' ? 'Ocultar' : 'Exibir'}
                            type="button"
                          >
                            {product.publication?.operationalStatus === 'active' ? 'Ocultar' : 'Exibir'}
                          </button>
                        </PermissionGate>
                        <button
                          onClick={() => handleDelete(product.id)}
                          className="col-span-2 px-3 py-2 text-xs font-black text-red-700 bg-red-50 hover:bg-red-100 rounded-xl border border-red-200"
                          title="Excluir"
                          type="button"
                        >
                          Excluir
                        </button>
                      </div>
                    </div>
                  );
                })}

                {filteredProducts.length === 0 ? (
                  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center text-gray-400 font-medium italic">
                    {searchTerm.trim().length > 0 || statusFilter !== 'all' || typeFilter !== 'all' || publicationFilter !== 'all' || operationalFilter !== 'all' || Boolean(selectedCategoryId)
                      ? 'Nenhum resultado para os filtros atuais.'
                      : 'Nenhum produto cadastrado ainda no cardápio.'}
                  </div>
                ) : null}
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hidden md:block">
                <div ref={tableScrollRef} className="max-h-[70vh] overflow-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50/50 border-b border-gray-100 sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Produto</th>
                        <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider hidden lg:table-cell">Categoria</th>
                        <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Preço</th>
                        <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredProducts.length > 0 && virtualAll.topSpacer > 0 && (
                        <tr>
                          <td colSpan={5} style={{ height: virtualAll.topSpacer }} className="p-0 border-0" />
                        </tr>
                      )}

                      {renderRows(filteredProducts.slice(virtualAll.startIndex, virtualAll.endExclusive))}

                      {filteredProducts.length > 0 && virtualAll.bottomSpacer > 0 && (
                        <tr>
                          <td colSpan={5} style={{ height: virtualAll.bottomSpacer }} className="p-0 border-0" />
                        </tr>
                      )}
                      {filteredProducts.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-gray-400 font-medium italic">
                            {searchTerm.trim().length > 0 || statusFilter !== 'all' || typeFilter !== 'all' || publicationFilter !== 'all' || operationalFilter !== 'all' || Boolean(selectedCategoryId)
                              ? 'Nenhum resultado para os filtros atuais.'
                              : 'Nenhum produto cadastrado ainda no cardápio.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              {productsGroupedByCategory.map((group) => {
                const title = group.category?.name ?? 'Sem categoria';
                const isExpanded = expandedGroups[group.key] ?? true;
                return (
                  <section key={group.key} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleGroupExpanded(group.key)}
                      className="w-full px-6 py-4 bg-gray-50/40 border-b border-gray-100 flex items-center justify-between hover:bg-gray-50 transition-colors"
                    >
                      <div className="text-left">
                        <div className="text-sm font-black text-gray-900 uppercase tracking-tight">{title}</div>
                        <div className="text-xs text-gray-500 font-bold">{group.products.length} produto(s)</div>
                      </div>
                      <div className="flex items-center gap-3">
                        {group.category && (
                          <span className="text-xs font-black uppercase tracking-wider text-gray-500">
                            {selectedCategoryId === group.category.id ? 'Filtrado' : ''}
                          </span>
                        )}
                        <ChevronDown size={18} className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="max-h-[60vh] overflow-auto">
                        <table className="w-full text-left border-collapse">
                          <thead className="bg-white border-b border-gray-100 sticky top-0 z-10">
                            <tr>
                              <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Produto</th>
                              <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider hidden lg:table-cell">Categoria</th>
                              <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Preço</th>
                              <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider">Tipo/Status</th>
                              <th className="px-6 py-3 text-xs font-black text-gray-400 uppercase tracking-wider text-right">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {renderRows(group.products)}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                );
              })}

              {productsGroupedByCategory.length === 0 && (
                <div className="py-16 text-center text-gray-400 font-bold italic">
                  Nenhum produto encontrado.
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal CRUD */}
      {/* Modal CRUD Legado Removido */}

      {recipeTarget && (
        <RecipeModal
          isOpen={!!recipeTarget}
          onClose={() => setRecipeTarget(null)}
          entityType="product"
          entityId={recipeTarget.id}
          entityName={recipeTarget.name}
        />
      )}

      {/* Modal de ajuda sobre status */}
      <Modal
        isOpen={showStatusHelp}
        onClose={() => setShowStatusHelp(false)}
        title="Status dos produtos"
        footer={
          <button
            type="button"
            onClick={() => setShowStatusHelp(false)}
            className="px-4 py-2 text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 rounded-lg"
          >
            Entendido
          </button>
        }
      >
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-black text-gray-900 mb-2">Publicação (publicationStatus)</h3>
            <p className="text-xs text-gray-600 mb-2">Controla a visibilidade externa do produto (storefront, PDV, etc.).</p>
            <ul className="text-xs text-gray-500 space-y-1">
              <li><span className="font-bold text-gray-700">Draft:</span> rascunho, não visível publicamente.</li>
              <li><span className="font-bold text-gray-700">Publicado:</span> visível em catálogos públicos.</li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-black text-gray-900 mb-2">Operação (operationalStatus)</h3>
            <p className="text-xs text-gray-600 mb-2">Define se o produto pode ser vendido no momento, mesmo estando publicado.</p>
            <ul className="text-xs text-gray-500 space-y-1">
              <li><span className="font-bold text-gray-700">Active:</span> disponível para venda.</li>
              <li><span className="font-bold text-gray-700">Hidden:</span> visível mas não vendável (indisponível).</li>
              <li><span className="font-bold text-gray-700">Sold out:</span> esgotado manualmente.</li>
              <li><span className="font-bold text-gray-700">Inactive:</span> oculto e não vendável.</li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-black text-gray-900 mb-2">Status Geral (isActive)</h3>
            <p className="text-xs text-gray-600 mb-2">Controle de baixo nível (soft-delete). Geralmente não alterado no dia a dia.</p>
            <ul className="text-xs text-gray-500 space-y-1">
              <li><span className="font-bold text-gray-700">Ativo:</span> produto existe no sistema.</li>
              <li><span className="font-bold text-gray-700">Inativo:</span> produto desativado (soft delete).</li>
            </ul>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
            <p className="text-xs text-gray-600">
              <span className="font-black">Dica:</span> Use <span className="font-bold">Publicado + Active</span> para vender normalmente.
              Use <span className="font-bold">Hidden</span> para manter visível mas indisponível.
              Use <span className="font-bold">Draft</span> para produtos em criação/aprovação.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
