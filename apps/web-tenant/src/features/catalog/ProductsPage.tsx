import React, { useMemo, useState, useEffect } from 'react';
import { api } from '../../lib/api-client';
import { CatalogPublication, Product, ProductCategory, CreateProductDto } from '@gestor/types';
import { RecipeModal } from '../inventory/RecipeModal';
import { Modal } from '../../components/Modal';
import { PermissionGate } from '../../components/PermissionGate';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, Pencil, Trash2, FileText, Search, ChevronDown, Send, EyeOff, Copy, Plus } from 'lucide-react';







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
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<ProductTypeFilter>('all');
  const [publicationFilter, setPublicationFilter] = useState<PublicationFilter>('all');
  const [operationalFilter] = useState<OperationalFilter>('all');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [showStatusHelp, setShowStatusHelp] = useState(false);
  const tableScrollRef = React.useRef<HTMLDivElement | null>(null);
  const [tableScrollTop, setTableScrollTop] = useState(0);
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  

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
      list = list.filter((p) => p.publication?.publicationStatus === publicationFilter);
    }

    if (operationalFilter !== 'all') {
      list = list.filter((p) => p.publication?.operationalStatus === operationalFilter);
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

  const handleDuplicate = async (id: string) => {
    const key = `duplicate-${id}`;
    if (savingMap[key]) return;
    setSavingMap((prev) => ({ ...prev, [key]: true }));
    try {
      await api.post(`/catalog/products/${id}/duplicate`);
      await loadData();
    } catch (error) {
      console.error('Erro ao duplicar produto:', error);
    } finally {
      setSavingMap((prev) => ({ ...prev, [key]: false }));
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
        <tr key={product.id} className="transition-colors duration-150 group" style={{ height: 64, backgroundColor: 'var(--surface-base)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--surface-subtle)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--surface-base)'; }}
        >
          <td className="px-6 py-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-lg bg-muted/50 dark:bg-muted/80 border border-border overflow-hidden shrink-0">
                {product.image ? (
                  <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-[10px] font-black uppercase tracking-widest">
                    IMG
                  </div>
                )}
              </div>

              <div className="min-w-0">
                <div className="font-bold text-foreground truncate">{product.name}</div>
                <div className="text-xs text-muted-foreground truncate hidden sm:block">{product.shortDescription || 'Sem descrição'}</div>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors ${product.type === 'combo' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-secondary text-foreground border-border'}`}>
                    {typeLabel}
                  </span>
                  {pubLabel ? (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${pubLabel === 'published' ? 'bg-primary/10 dark:bg-primary/10 text-primary dark:text-primary border border-primary/20 dark:border-primary/30' : 'bg-secondary text-muted-foreground border border-border'}`}>
                      {pubLabel}
                    </span>
                  ) : null}
                  {opLabel ? (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${opLabel === 'active' ? 'status-badge-success' : opLabel === 'inactive' ? 'status-badge-neutral' : opLabel === 'hidden' ? 'status-badge-warning' : 'status-badge-danger'}`}>
                      {opLabel}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </td>

          <td className="px-6 py-2 text-sm text-muted-foreground font-medium hidden lg:table-cell">
            {categoryName}
          </td>

          <td className="px-6 py-2 text-sm font-black text-foreground whitespace-nowrap">
            {formatMoney(product.basePrice)}
          </td>

          <td className="px-6 py-2 text-sm whitespace-nowrap">
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${product.isActive ? 'status-badge-success' : 'status-badge-danger'}`}>
              {product.isActive ? 'Ativo' : 'Inativo'}
            </span>
          </td>

          <td className="px-6 py-2 text-sm text-right">
            <div className="flex justify-end gap-1.5 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => setRecipeTarget({ id: product.id, name: product.name })}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 dark:hover:bg-muted/80 rounded-lg transition-all"
                title="Ficha técnica"
                type="button"
              >
                <FileText size={16} />
              </button>
              <button
                onClick={() => navigate(`/catalog/products/${product.id}/v2`)}
                className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                title="Editar"
                type="button"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={() => handleDuplicate(product.id)}
                disabled={savingMap[`duplicate-${product.id}`]}
                className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all disabled:opacity-70"
                title={savingMap[`duplicate-${product.id}`] ? 'Duplicando...' : 'Duplicar'}
                type="button"
              >
                <Copy size={16} />
              </button>
              <PermissionGate permission="catalog.publish" fallback={null}>
                <button
                  onClick={() => handleTogglePublication(product)}
                  className={`p-2 rounded-lg transition-all ${product.publication?.publicationStatus === 'published' ? 'text-status-success hover:text-status-success hover:bg-status-success/10 dark:hover:bg-status-success/20' : 'text-muted-foreground hover:text-primary hover:bg-primary/10 dark:hover:bg-primary/20'}`}
                  title={product.publication?.publicationStatus === 'published' ? 'Despublicar' : 'Publicar'}
                  type="button"
                >
                  {product.publication?.publicationStatus === 'published' ? <Send size={16} /> : <EyeOff size={16} />}
                </button>
              </PermissionGate>
              <PermissionGate permission="catalog.publish" fallback={null}>
                <button
                  onClick={() => handleToggleOperational(product)}
                  className={`p-2 rounded-lg transition-all ${product.publication?.operationalStatus === 'active' ? 'text-status-success hover:text-status-success hover:bg-status-success/10 dark:hover:bg-status-success/20' : 'text-muted-foreground hover:text-status-warning hover:bg-status-warning/10 dark:hover:bg-status-warning/20'}`}
                  title={product.publication?.operationalStatus === 'active' ? 'Ocultar' : 'Exibir'}
                  type="button"
                >
                  {product.publication?.operationalStatus === 'active' ? <Eye size={16} /> : <EyeOff size={16} />}
                </button>
              </PermissionGate>
              <button
                onClick={() => handleToggleActive(product)}
                className={`p-2 rounded-lg transition-all ${product.isActive ? 'text-muted-foreground hover:text-status-warning hover:bg-status-warning/10 dark:hover:bg-status-warning/20' : 'text-muted-foreground hover:text-status-success hover:bg-status-success/10 dark:hover:bg-status-success/20'}`}
                title={product.isActive ? 'Desativar' : 'Ativar'}
                type="button"
              >
                <Eye size={16} />
              </button>
              <button
                onClick={() => handleDelete(product.id)}
                className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 dark:hover:bg-destructive/20 rounded-lg transition-all"
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

  const renderCards = (list: ProductWithPublication[]) => {
    return list.map((product) => {
      const categoryName = product.categoryId ? (categoriesById.get(product.categoryId)?.name ?? 'Sem Categoria') : 'Sem Categoria';
      const pub = (product as ProductWithPublication).publication;
      const pubLabel = pub ? pub.publicationStatus : null;
      const opLabel = pub ? pub.operationalStatus : null;
      return (
        <div key={product.id} className="card-premium p-3 md:p-4 hover:shadow-md transition-all">
          <div className="flex items-start justify-between gap-3">
            <div className="flex gap-3 min-w-0 flex-1">
               <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-muted/50 dark:bg-muted/80 border border-border overflow-hidden shrink-0 shadow-sm">
                {product.image ? (
                  <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground text-[10px] font-black uppercase tracking-widest">
                    IMG
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="font-black text-foreground truncate text-sm md:text-base leading-tight">{product.name}</div>
                <div className="text-[10px] md:text-xs text-muted-foreground font-bold mt-0.5 truncate">{categoryName}</div>
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <span className={`px-1.5 py-0.5 rounded-full text-[8px] md:text-[9px] font-black uppercase tracking-widest border transition-colors ${product.type === 'combo' ? 'bg-primary/10 text-primary border-primary/20' : 'bg-secondary text-foreground border-border'}`}>
                    {product.type === 'simple' ? 'Individual' : product.type === 'configurable' ? 'Personalizado' : 'Combo'}
                  </span>
                  {pubLabel && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[8px] md:text-[9px] font-black uppercase tracking-widest ${pubLabel === 'published' ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-secondary text-muted-foreground border border-border'}`}>
                      {pubLabel}
                    </span>
                  )}
                  {opLabel && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[8px] md:text-[9px] font-black uppercase tracking-widest ${opLabel === 'active' ? 'status-badge-success' : opLabel === 'inactive' ? 'status-badge-neutral' : opLabel === 'hidden' ? 'status-badge-warning' : 'status-badge-danger'}`}>
                      {opLabel}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[9px] md:text-[10px] text-muted-foreground font-black uppercase tracking-widest mb-0.5">Preço</div>
              <div className="text-sm md:text-base font-black text-foreground">{formatMoney(product.basePrice)}</div>
            </div>
          </div>

          <div
            className="mt-3 md:mt-4 flex items-center justify-between pt-3 md:pt-4"
            style={{ borderTop: '1px solid var(--border-subtle)' }}
          >
             <div className="flex items-center gap-2">
               <span className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${product.isActive ? 'bg-status-success animate-pulse' : 'bg-destructive'}`} />
               <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {product.isActive ? 'Ativo' : 'Inativo'}
              </span>
             </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => navigate(`/catalog/products/${product.id}/v2`)}
                className="p-1.5 md:p-2 text-primary bg-primary/10 rounded-xl hover:bg-primary/20 transition-colors"
                title="Editar"
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => handleDuplicate(product.id)}
                disabled={savingMap[`duplicate-${product.id}`]}
                className="p-1.5 md:p-2 text-primary bg-primary/10 rounded-xl hover:bg-primary/20 transition-colors disabled:opacity-70"
                title="Duplicar"
              >
                <Copy size={14} />
              </button>
              <button
                onClick={() => setRecipeTarget({ id: product.id, name: product.name })}
                className="p-1.5 md:p-2 text-muted-foreground bg-muted/50 dark:bg-muted/80 rounded-xl hover:bg-muted/70 transition-colors"
                title="Ficha técnica"
              >
                <FileText size={14} />
              </button>
              <button
                onClick={() => handleDelete(product.id)}
                className="p-1.5 md:p-2 text-destructive bg-destructive/10 rounded-xl hover:bg-destructive/20 transition-colors"
                title="Excluir"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>
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
    <div className="p-3 md:p-6 max-w-7xl mx-auto text-left">
      {/* Header */}
      <div className="page-header mb-5 md:mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-foreground tracking-tight uppercase">Produtos</h1>
          <p className="text-[11px] md:text-sm text-muted-foreground font-medium mt-0.5">Gerencie seu cardápio de forma simples.</p>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => navigate('/catalog/simulation')}
            className="btn-secondary flex-1 md:flex-none flex items-center justify-center gap-2 h-10 px-4 text-xs"
            type="button"
          >
            <Search size={14} className="hidden sm:block" /> 
            <span>Simulador</span>
          </button>

          <button
            onClick={() => navigate('/catalog/products/new/v2')}
            className="btn-primary flex-1 md:flex-none flex items-center justify-center gap-2 h-10 px-4 text-xs"
            type="button"
          >
            <Plus size={14} className="hidden sm:block" />
            <span>Novo Produto</span>
          </button>
        </div>
      </div>

      {/* Barra de Busca e Filtros */}
      <div className="toolbar-bar mb-6 p-3 md:p-4">
        <div className="flex flex-col gap-3 md:gap-4">
          {/* Linha 1: Busca e ViewMode */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-premium pl-10 h-10 md:h-11"
                placeholder="Buscar produtos..."
                type="text"
              />
            </div>

            <div
              className="flex items-center p-1 rounded-xl w-full md:w-auto shrink-0"
              style={{ background: 'var(--surface-inset)', border: '1px solid var(--border-default)' }}
            >
              <button
                onClick={() => setViewMode('all')}
                className={`flex-1 md:flex-none md:px-6 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                  viewMode === 'all'
                    ? 'bg-card text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                type="button"
              >
                Lista
              </button>
              <button
                onClick={() => setViewMode('grouped')}
                className={`flex-1 md:flex-none md:px-6 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                  viewMode === 'grouped'
                    ? 'bg-card text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                type="button"
              >
                Categorias
              </button>
            </div>
          </div>

          {/* Linha 2: Filtros de Tipo, Status e Categoria */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 -mx-3 px-3 sm:mx-0 sm:px-0">
              {[
                { id: 'all', label: 'Todos' },
                { id: 'simple', label: 'Individuais' },
                { id: 'configurable', label: 'Personalizados' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTypeFilter(t.id as ProductTypeFilter)}
                  className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all border ${
                    typeFilter === t.id
                      ? 'bg-primary/10 border-primary/20 text-primary'
                      : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div
              className="h-5 w-px hidden lg:block"
              style={{ background: 'var(--border-default)' }}
            />

            <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto no-scrollbar pb-1">
              <select
                value={selectedCategoryId ?? ''}
                onChange={(e) => setCategoryFilter(e.target.value ? e.target.value : null)}
                className="h-8 pl-2 pr-6 bg-card border border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 rounded-lg cursor-pointer transition-all"
              >
                <option value="">Categorias</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
                <option value="__uncategorized__">Sem categoria</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as ProductStatusFilter)}
                className="h-8 pl-2 pr-6 bg-card border border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 rounded-lg cursor-pointer transition-all"
              >
                <option value="all">Status</option>
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
              </select>

              <select
                value={publicationFilter}
                onChange={(e) => setPublicationFilter(e.target.value as PublicationFilter)}
                className="h-8 pl-2 pr-6 bg-card border border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 rounded-lg cursor-pointer transition-all"
              >
                <option value="all">Publicação</option>
                <option value="draft">Rascunho</option>
                <option value="published">Publicado</option>
              </select>
            </div>
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
                {renderCards(filteredProducts)}
                {filteredProducts.length === 0 ? (
                  <div className="bg-card rounded-2xl shadow-sm border border-border p-6 text-center text-muted-foreground font-medium italic">
                    {searchTerm.trim().length > 0 || statusFilter !== 'all' || typeFilter !== 'all' || publicationFilter !== 'all' || operationalFilter !== 'all' || Boolean(selectedCategoryId)
                      ? 'Nenhum resultado para os filtros atuais.'
                      : 'Nenhum produto cadastrado ainda no cardápio.'}
                  </div>
                ) : null}
              </div>


              <div className="card-premium hidden md:block overflow-hidden">
                <div ref={tableScrollRef} className="max-h-[70vh] overflow-auto custom-scrollbar">
                  <table className="table-premium">
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th className="hidden lg:table-cell">Categoria</th>
                        <th>Preço</th>
                        <th>Status</th>
                        <th className="text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
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
                          <td colSpan={5} className="px-6 py-12 text-center text-muted-foreground font-medium italic">
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
            <div className="space-y-4 max-w-full overflow-x-hidden">
              {productsGroupedByCategory.map((group) => {
                const title = group.category?.name ?? 'Sem categoria';
                const isExpanded = expandedGroups[group.key] ?? true;
                return (
                  <section key={group.key} className="card-premium border-none shadow-sm">
                    <button
                      type="button"
                      onClick={() => toggleGroupExpanded(group.key)}
                      className="w-full px-4 py-4 bg-muted/20 dark:bg-muted/80 flex items-center justify-between hover:bg-muted/70 dark:hover:bg-muted/90 transition-all"
                    >
                      <div className="text-left min-w-0 flex-1">
                        <div className="text-sm font-black text-foreground uppercase tracking-tight truncate">{title}</div>
                        <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">{group.products.length} {group.products.length === 1 ? 'produto' : 'produtos'}</div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-4">
                        <div className={`w-8 h-8 flex items-center justify-center rounded-full bg-card border border-border transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                          <ChevronDown size={16} className="text-muted-foreground" />
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                        {/* Mobile View: Cards */}
                        <div className="md:hidden p-3 space-y-3">
                          {renderCards(group.products)}
                        </div>

                        {/* Desktop View: Table */}
                        <div className="hidden md:block max-h-[60vh] overflow-auto custom-scrollbar">
                          <table className="w-full text-left border-collapse">
                            <thead className="bg-card border-b border-border sticky top-0 z-10">
                              <tr>
                                <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Produto</th>
                                <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest hidden lg:table-cell">Categoria</th>
                                <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-center">Preço</th>
                                <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Status</th>
                                <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-right">Ações</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border dark:divide-border/60">
                              {renderRows(group.products)}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </section>
                );
              })}

              {productsGroupedByCategory.length === 0 && (
                <div className="card-premium py-20 text-center flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-muted/50 dark:bg-muted/80 flex items-center justify-center text-muted-foreground">
                    <Search size={32} />
                  </div>
                  <div className="text-muted-foreground font-black uppercase tracking-widest text-xs">
                    Nenhum produto encontrado nesta visualização.
                  </div>
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
          onClose={() => {
            setRecipeTarget(null);
            loadData();
          }}
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
            className="px-4 py-2 text-sm font-bold text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg"
          >
            Entendido
          </button>
        }
      >
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-black text-foreground mb-2">Publicação (publicationStatus)</h3>
            <p className="text-xs text-muted-foreground mb-2">Controla a visibilidade externa do produto (storefront, PDV, etc.).</p>
            <ul className="text-xs text-muted-foreground dark:text-muted-foreground space-y-1">
              <li><span className="font-bold text-foreground dark:text-muted-foreground">Draft:</span> rascunho, não visível publicamente.</li>
              <li><span className="font-bold text-foreground dark:text-muted-foreground">Publicado:</span> visível em catálogos públicos.</li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-black text-foreground mb-2">Operação (operationalStatus)</h3>
            <p className="text-xs text-muted-foreground mb-2">Define se o produto pode ser vendido no momento, mesmo estando publicado.</p>
            <ul className="text-xs text-muted-foreground dark:text-muted-foreground space-y-1">
              <li><span className="font-bold text-foreground dark:text-muted-foreground">Active:</span> disponível para venda.</li>
              <li><span className="font-bold text-foreground dark:text-muted-foreground">Hidden:</span> visível mas não vendável (indisponível).</li>
              <li><span className="font-bold text-foreground dark:text-muted-foreground">Sold out:</span> esgotado manualmente.</li>
              <li><span className="font-bold text-foreground dark:text-muted-foreground">Inactive:</span> oculto e não vendável.</li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-black text-foreground mb-2">Status Geral (isActive)</h3>
            <p className="text-xs text-muted-foreground mb-2">Controle de baixo nível (soft-delete). Geralmente não alterado no dia a dia.</p>
            <ul className="text-xs text-muted-foreground dark:text-muted-foreground space-y-1">
              <li><span className="font-bold text-foreground dark:text-muted-foreground">Ativo:</span> produto existe no sistema.</li>
              <li><span className="font-bold text-foreground dark:text-muted-foreground">Inativo:</span> produto desativado (soft delete).</li>
            </ul>
          </div>

          <div className="bg-muted/50 dark:bg-muted/80 border border-border dark:border-border/80 rounded-xl p-3">
            <p className="text-xs text-muted-foreground dark:text-muted-foreground">
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
