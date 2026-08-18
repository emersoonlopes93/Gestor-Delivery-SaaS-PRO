import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api-client';
import { Product, ProductCategory, CreateProductDto } from '@gestor/types';
import { RecipeModal } from '../inventory/RecipeModal';
import { Modal } from '../../components/Modal';
import { useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle2, Pencil, Trash2, FileText, Search, ChevronDown, Copy, Plus, ChefHat, X } from 'lucide-react';
import { useTenantCapabilities } from '../../hooks/useTenantCapabilities';
import { Switch } from '../../components/ui/Switch';
import { ProductComplementsInline } from './SubComponents/ProductComplementsInline';







type ProductsViewMode = 'all' | 'grouped';

type ProductStatusFilter = 'all' | 'active' | 'paused' | 'sold_out';
type ProductTypeFilter = 'all' | 'simple' | 'configurable';
type BusinessStatus = 'active' | 'paused' | 'sold_out';

const getBusinessStatus = (product: Pick<Product, 'isActive' | 'isAvailable'>): BusinessStatus => {
  if (!product.isActive) return 'paused';
  if (!product.isAvailable) return 'sold_out';
  return 'active';
};

const BUSINESS_STATUS_LABEL: Record<BusinessStatus, string> = {
  active: 'Ativo',
  paused: 'Pausado',
  sold_out: 'Esgotado',
};

const BUSINESS_STATUS_BADGE: Record<BusinessStatus, string> = {
  active: 'bg-status-success/20 text-status-success border-status-success/30',
  paused: 'bg-status-warning/20 text-status-warning border-status-warning/30',
  sold_out: 'bg-destructive/20 text-destructive border-destructive/30',
};

export function ProductsPage() {
  type ProductWithPublication = Product & { publication?: unknown };

  const [products, setProducts] = useState<ProductWithPublication[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [recipeTarget, setRecipeTarget] = useState<{ id: string, name: string } | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { capabilities } = useTenantCapabilities();
  const baseMenuImportEnabled = capabilities?.actions?.['baseMenu.import']?.enabled === true;
  const [viewMode, setViewMode] = useState<ProductsViewMode>(() => {
    const saved = localStorage.getItem('gestor.catalog.viewMode');
    return (saved === 'all' || saved === 'grouped') ? saved : 'grouped';
  });

  useEffect(() => {
    localStorage.setItem('gestor.catalog.viewMode', viewMode);
  }, [viewMode]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<ProductTypeFilter>('all');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [showStatusHelp, setShowStatusHelp] = useState(false);
  const tableScrollRef = React.useRef<HTMLDivElement | null>(null);
  const [tableScrollTop, setTableScrollTop] = useState(0);
  const [savingMap, setSavingMap] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [expandedComplements, setExpandedComplements] = useState<Record<string, boolean>>({});
  
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [bannerStats, setBannerStats] = useState({ categories: 0, products: 0, skipped: 0 });

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const source = params.get('source');
    if (source === 'base-menu') {
      setShowSuccessBanner(true);
      setBannerStats({
        categories: parseInt(params.get('categories') || '0', 10),
        products: parseInt(params.get('products') || '0', 10),
        skipped: parseInt(params.get('skipped') || '0', 10),
      });
    }
  }, [location.search]);

  const isRecentlyImported = useCallback((product: Product) => {
    if (!product.createdAt) return false;
    const createdTime = new Date(product.createdAt).getTime();
    const now = Date.now();
    // 5 minutos = 300000ms
    return now - createdTime < 300000;
  }, []);

  const handleCloseBanner = () => {
    setShowSuccessBanner(false);
    navigate(location.pathname, { replace: true });
  };
  

  const loadData = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
      list = list.filter((p) => getBusinessStatus(p) === statusFilter);
    }

    if (typeFilter !== 'all') {
      list = list.filter((p) => (p.type ?? 'simple') === typeFilter);
    }

    return [...list].sort((a, b) => {
      const aOrder = a.order ?? 0;
      const bOrder = b.order ?? 0;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'pt-BR');
    });
  }, [products, selectedCategoryId, searchTerm, statusFilter, typeFilter, categoriesById]);

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



  // CRUD operations now occur in CatalogEditorPage
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

  const updateProductStatus = async (product: Product, next: Pick<Product, 'isActive' | 'isAvailable'>) => {
    const previous = { isActive: product.isActive, isAvailable: product.isAvailable };
    setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, ...next } : p)));

    try {
      const payload: Partial<CreateProductDto> = {
        isActive: next.isActive,
        isAvailable: next.isAvailable,
      };
      await api.patch(`/catalog/products/${product.id}`, payload);
    } catch (error) {
      setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, ...previous } : p)));
      console.error('Erro ao alterar status do produto:', error);
    }
  };

  const setProductBusinessStatus = (product: Product, status: BusinessStatus) => {
    if (status === 'active') return updateProductStatus(product, { isActive: true, isAvailable: true });
    if (status === 'paused') return updateProductStatus(product, { isActive: false, isAvailable: product.isAvailable });
    return updateProductStatus(product, { isActive: true, isAvailable: false });
  };

  const handleCategoryToggle = async (categoryId: string, isActive: boolean) => {
    if (categoryId === '__uncategorized__') return;
    const previous = categories.find((c) => c.id === categoryId)?.isActive;
    setCategories((prev) => prev.map((c) => (c.id === categoryId ? { ...c, isActive } : c)));
    try {
      await api.patch(`/catalog/categories/${categoryId}`, { isActive });
    } catch (error) {
      setCategories((prev) => prev.map((c) => (c.id === categoryId ? { ...c, isActive: previous ?? true } : c)));
      console.error('Erro ao alterar status da categoria:', error);
    }
  };

  const toggleSelected = (id: string) => setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const bulkSetActive = async (isActive: boolean) => {
    if (selectedIds.length === 0 || bulkSaving) return;
    setBulkSaving(true);
    try {
      await api.patch('/catalog/products/bulk-active', { ids: selectedIds, isActive });
      setSelectedIds([]);
      await loadData();
    } catch (error) {
      console.error('Erro ao atualizar produtos selecionados:', error);
    } finally {
      setBulkSaving(false);
    }
  };

  const toggleGroupExpanded = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  };

  const toggleComplementExpanded = (productId: string) => {
    setExpandedComplements((prev) => ({ ...prev, [productId]: !prev[productId] }));
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
      const businessStatus = getBusinessStatus(product);
      return (
        <React.Fragment key={product.id}>
          <tr className={`border-b border-border last:border-b-0 bg-card text-card-foreground transition-colors duration-150 hover:bg-muted/60 ${expandedComplements[product.id] ? 'border-b-0' : ''}`}>
            {isBulkMode && (
            <td className="px-4 py-4">
              <input aria-label={`Selecionar ${product.name}`} type="checkbox" checked={selectedIds.includes(product.id)} onChange={() => toggleSelected(product.id)} />
            </td>
          )}
          <td className="px-6 py-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-lg bg-muted dark:bg-muted/80 border border-border overflow-hidden shrink-0">
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
                <div className="mt-1 flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${product.type === 'combo' ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-foreground border-border'}`}>
                    {typeLabel}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${BUSINESS_STATUS_BADGE[businessStatus]}`}>
                    {BUSINESS_STATUS_LABEL[businessStatus]}
                  </span>
                  {isRecentlyImported(product) && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                      Importado
                    </span>
                  )}
                </div>
              </div>
            </div>
          </td>

          <td className="px-6 py-4 text-sm text-muted-foreground font-medium hidden lg:table-cell">
            {categoryName}
          </td>

          <td className="px-6 py-4 text-sm font-black text-foreground whitespace-nowrap text-right">
            {formatMoney(product.basePrice)}
          </td>

          <td className="px-6 py-4 text-sm whitespace-nowrap">
            <div className="flex items-center gap-2">
              <Switch
                checked={product.isActive}
                onCheckedChange={(checked: boolean) => setProductBusinessStatus(product, checked ? 'active' : 'paused')}
                aria-label={`Status do produto ${product.name}`}
              />
              {!product.isActive && <span className="text-[10px] text-muted-foreground font-medium italic">Pausado</span>}
            </div>
          </td>

          <td className="px-6 py-4 text-sm text-right">
            <div className="flex justify-end gap-1.5">
              <button
                onClick={() => setRecipeTarget({ id: product.id, name: product.name })}
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                title="Ficha técnica"
                type="button"
              >
                <FileText size={16} />
              </button>
              <button
                onClick={() => navigate(`/catalog/products/${product.id}/v2`)}
                className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                title="Editar"
                type="button"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={() => handleDuplicate(product.id)}
                disabled={savingMap[`duplicate-${product.id}`]}
                className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                title={savingMap[`duplicate-${product.id}`] ? 'Duplicando...' : 'Duplicar'}
                type="button"
              >
                <Copy size={16} />
              </button>
              <button
                  onClick={() => handleDelete(product.id)}
                  className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                  title="Excluir"
                  type="button"
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {(product._count?.optionGroupLinks ?? 0) > 0 && (
                <div className="flex justify-end mt-2">
                  <button
                    type="button"
                    onClick={() => toggleComplementExpanded(product.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted/30 hover:bg-muted text-[10px] font-black uppercase tracking-widest text-muted-foreground transition-colors"
                  >
                    <span>Complements ({product._count!.optionGroupLinks})</span>
                    <ChevronDown size={14} className={`transition-transform duration-300 ${expandedComplements[product.id] ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              )}
            </td>
          </tr>
          {expandedComplements[product.id] && (
            <tr className="bg-card border-b border-border">
              <td colSpan={isBulkMode ? 7 : 6} className="p-0">
                <ProductComplementsInline productId={product.id} isParentActive={product.isActive} />
              </td>
            </tr>
          )}
        </React.Fragment>
      );
    });
  };

  const renderCards = (list: ProductWithPublication[]) => {
    return list.map((product) => {
      const categoryName = product.categoryId ? (categoriesById.get(product.categoryId)?.name ?? 'Sem Categoria') : 'Sem Categoria';
      const businessStatus = getBusinessStatus(product);
      return (
        <div key={product.id} className="card-premium hover:shadow-md transition-all overflow-hidden flex flex-col">
          <div className="p-3 md:p-4">
            <div className="flex items-start justify-between gap-3">
            {isBulkMode && (
              <input aria-label={`Selecionar ${product.name}`} type="checkbox" checked={selectedIds.includes(product.id)} onChange={() => toggleSelected(product.id)} />
            )}
            <div className="flex gap-3 min-w-0 flex-1">
               <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-muted dark:bg-muted/80 border border-border overflow-hidden shrink-0 shadow-sm">
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
                  <span className={`px-1.5 py-0.5 rounded-full text-[8px] md:text-[9px] font-black uppercase tracking-widest border transition-colors ${product.type === 'combo' ? 'bg-primary text-primary-foreground border-primary' : 'bg-secondary text-foreground border-border'}`}>
                    {product.type === 'simple' ? 'Individual' : product.type === 'configurable' ? 'Personalizado' : 'Combo'}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded-full text-[8px] md:text-[9px] font-black uppercase tracking-widest border ${BUSINESS_STATUS_BADGE[businessStatus]}`}>
                    {BUSINESS_STATUS_LABEL[businessStatus]}
                  </span>
                  {isRecentlyImported(product) && (
                    <span className="px-1.5 py-0.5 rounded-full text-[8px] md:text-[9px] font-black uppercase tracking-widest border bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                      Importado
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
               <Switch
                checked={product.isActive}
                onCheckedChange={(checked: boolean) => setProductBusinessStatus(product, checked ? 'active' : 'paused')}
                aria-label={`Status do produto ${product.name}`}
              />
               <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                {product.isActive ? 'Ativo' : 'Pausado'}
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
                className="p-1.5 md:p-2 text-muted-foreground bg-muted dark:bg-muted/80 rounded-xl hover:bg-muted/70 transition-colors"
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
          {(product._count?.optionGroupLinks ?? 0) > 0 && (
            <div className="px-3 md:px-4 pb-3">
              <button
                type="button"
                onClick={() => toggleComplementExpanded(product.id)}
                className="w-full py-2 bg-muted/30 border border-border hover:bg-muted/50 rounded-lg flex items-center justify-center gap-2 transition-colors text-xs font-bold uppercase tracking-wider text-muted-foreground"
              >
                <span>Complementos ({product._count!.optionGroupLinks})</span>
                <ChevronDown size={14} className={`transition-transform duration-300 ${expandedComplements[product.id] ? 'rotate-180' : ''}`} />
              </button>
            </div>
          )}
          {expandedComplements[product.id] && (
            <ProductComplementsInline productId={product.id} isParentActive={product.isActive} />
          )}
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
      {/* Banner de Sucesso */}
      {showSuccessBanner && (
        <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 flex items-start justify-between gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-start gap-3 text-left">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-sm text-emerald-900 dark:text-emerald-200">
                Cardápio pronto importado com sucesso! 🎉
              </h4>
              <p className="text-xs mt-1 text-emerald-800/90 dark:text-emerald-400 font-medium">
                Foram criados <span className="font-bold">{bannerStats.categories}</span> categorias e <span className="font-bold">{bannerStats.products}</span> produtos.
                {bannerStats.skipped > 0 && (
                  <> Adicionalmente, <span className="font-bold">{bannerStats.skipped}</span> itens existentes foram pulados.</>
                )}
                {" "}Revise preços, imagens e disponibilidade antes de começar a vender.
              </p>
              <div className="mt-2 flex gap-2">
                <button
                  onClick={handleCloseBanner}
                  className="text-[11px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-300 hover:underline"
                >
                  Revisar produtos
                </button>
              </div>
            </div>
          </div>
          <button
            onClick={handleCloseBanner}
            className="p-1 rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="page-header mb-5 md:mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-foreground tracking-tight uppercase">Produtos</h1>
          <p className="text-[11px] md:text-sm text-muted-foreground font-medium mt-0.5">Gerencie seu cardápio de forma simples.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <button
            onClick={() => setIsBulkMode(!isBulkMode)}
            className={`flex-1 md:flex-none flex items-center justify-center gap-2 h-10 px-4 text-xs font-black uppercase tracking-wider rounded-2xl border transition-colors shadow-sm ${
              isBulkMode 
                ? 'bg-muted text-foreground border-border' 
                : 'bg-card text-muted-foreground border-border hover:bg-muted'
            }`}
            type="button"
          >
            <span>{isBulkMode ? 'Concluir Seleção' : 'Seleção Múltipla'}</span>
          </button>
          <button
            onClick={() => navigate('/catalog/products/new/v2')}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 h-10 px-4 text-xs font-black uppercase tracking-wider rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
            type="button"
          >
            <Plus size={14} className="hidden sm:block" />
            <span>Novo Produto</span>
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : products.length === 0 ? (
        <div className="max-w-md mx-auto my-12 text-center py-10 px-6 card-premium border border-border bg-card shadow-lg flex flex-col items-center gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/25">
            <ChefHat className="w-8 h-8 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-black text-foreground uppercase tracking-tight mb-2">
              Seu catálogo está vazio
            </h2>
            <p className="text-sm text-muted-foreground font-medium">
              Você ainda não tem produtos cadastrados. Comece mais rápido importando um cardápio pronto ou adicione manualmente.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full mt-2">
            {baseMenuImportEnabled && <button
              onClick={() => navigate('/settings/menu-import')}
              className="flex-1 py-3 px-4 text-xs font-black uppercase tracking-wider bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white rounded-xl transition-all shadow-md shadow-indigo-500/25 flex items-center justify-center gap-2"
              type="button"
            >
              <ChefHat className="w-4 h-4" />
              <span>Importar Cardápio Pronto</span>
            </button>}
            <button
              onClick={() => navigate('/catalog/products/new/v2')}
              className="flex-1 py-3 px-4 text-xs font-black uppercase tracking-wider bg-card hover:bg-muted text-foreground border border-border rounded-xl transition-all flex items-center justify-center gap-2"
              type="button"
            >
              <Plus className="w-4 h-4" />
              <span>Cadastrar Manualmente</span>
            </button>
          </div>
        </div>
      ) : (
        <>
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

                <div className="flex items-center p-1 rounded-xl w-full md:w-auto shrink-0 bg-muted border border-border">
                  <button
                    onClick={() => setViewMode('all')}
                    className={`flex-1 md:flex-none md:px-6 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                      viewMode === 'all'
                        ? 'bg-card text-foreground shadow-sm ring-1 ring-inset ring-border'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                    type="button"
                  >
                    Lista
                  </button>
                  <button
                    onClick={() => setViewMode('grouped')}
                    className={`flex-1 md:flex-none md:px-6 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                      viewMode === 'grouped'
                        ? 'bg-card text-foreground shadow-sm ring-1 ring-inset ring-border'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                    type="button"
                  >
                    Categorias
                  </button>
                </div>
              </div>

              {/* Linha 2: Filtros de Tipo, Status e Categoria */}
              <div className="grid grid-cols-2 md:flex md:flex-wrap items-center gap-2">
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as ProductTypeFilter)}
                  className="h-8 pl-2 pr-6 bg-card text-foreground border border-input text-[10px] font-black uppercase tracking-widest focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-inset hover:bg-muted rounded-lg cursor-pointer transition-all"
                >
                  <option value="all">Tipos</option>
                  <option value="simple">Individuais</option>
                  <option value="configurable">Personalizados</option>
                </select>

                <select
                  value={selectedCategoryId ?? ''}
                  onChange={(e) => setCategoryFilter(e.target.value ? e.target.value : null)}
                  className="h-8 pl-2 pr-6 bg-card text-foreground border border-input text-[10px] font-black uppercase tracking-widest focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-inset hover:bg-muted rounded-lg cursor-pointer transition-all"
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
                  className="h-8 pl-2 pr-6 bg-card text-foreground border border-input text-[10px] font-black uppercase tracking-widest focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-inset hover:bg-muted rounded-lg cursor-pointer transition-all col-span-2 md:col-span-1"
                >
                  <option value="all">Status</option>
                  <option value="active">Ativos</option>
                  <option value="paused">Pausados</option>
                  <option value="sold_out">Esgotados</option>
                </select>
              </div>
            </div>
          </div>

          {selectedIds.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted p-3 text-sm">
              <span className="font-bold text-foreground">{selectedIds.length} selecionado(s)</span>
              <button type="button" disabled={bulkSaving} onClick={() => bulkSetActive(true)} className="rounded-lg bg-status-success px-3 py-1.5 font-bold text-white disabled:opacity-60">Ativar selecionados</button>
              <button type="button" disabled={bulkSaving} onClick={() => bulkSetActive(false)} className="rounded-lg bg-status-warning px-3 py-1.5 font-bold text-white disabled:opacity-60">Desativar selecionados</button>
            </div>
          )}

          {viewMode === 'all' ? (
            <>
              <div className="space-y-3 md:hidden">
                {renderCards(filteredProducts)}
                {filteredProducts.length === 0 ? (
                  <div className="bg-card rounded-2xl shadow-sm border border-border p-6 text-center text-muted-foreground font-medium italic">
                    {searchTerm.trim().length > 0 || statusFilter !== 'all' || typeFilter !== 'all' || Boolean(selectedCategoryId)
                      ? 'Nenhum resultado para os filtros atuais.'
                      : 'Nenhum produto cadastrado ainda no cardápio.'}
                  </div>
                ) : null}
              </div>

              <div className="card-premium hidden md:block overflow-hidden bg-card border border-border">
                <div ref={tableScrollRef} className="max-h-[70vh] overflow-auto custom-scrollbar">
                  <table className="w-full min-w-full border-separate border-spacing-0">
                    <thead className="bg-muted border-b border-border">
                      <tr>
                        {isBulkMode && (
                          <th className="px-4 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-left">Selecionar</th>
                        )}
                        <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-left">Produto</th>
                        <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest hidden lg:table-cell text-left">Categoria</th>
                        <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-right">Preço</th>
                        <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-left">Status</th>
                        <th className="px-6 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProducts.length > 0 && virtualAll.topSpacer > 0 && (
                        <tr>
                          <td colSpan={6} style={{ height: virtualAll.topSpacer }} className="p-0 border-0" />
                        </tr>
                      )}

                      {renderRows(filteredProducts.slice(virtualAll.startIndex, virtualAll.endExclusive))}

                      {filteredProducts.length > 0 && virtualAll.bottomSpacer > 0 && (
                        <tr>
                          <td colSpan={6} style={{ height: virtualAll.bottomSpacer }} className="p-0 border-0" />
                        </tr>
                      )}
                      {filteredProducts.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground font-medium italic">
                            {searchTerm.trim().length > 0 || statusFilter !== 'all' || typeFilter !== 'all' || Boolean(selectedCategoryId)
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
                  <section key={group.key} className="card-premium border border-border bg-card shadow-sm overflow-hidden">
                    <div className="w-full px-4 py-4 bg-card flex items-center justify-between border-b border-border hover:bg-muted/20 transition-all">
                      <button
                        type="button"
                        onClick={() => toggleGroupExpanded(group.key)}
                        className="text-left min-w-0 flex-1 flex flex-col justify-center"
                      >
                        <div className="text-sm font-black text-foreground uppercase tracking-tight truncate">{title}</div>
                        <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">{group.products.length} {group.products.length === 1 ? 'produto' : 'produtos'}</div>
                      </button>
                      <div className="flex items-center gap-4 shrink-0 ml-4">
                        {group.category && (
                          <div onClick={(e) => e.stopPropagation()}>
                            <Switch
                              checked={group.category.isActive ?? true}
                              onCheckedChange={(isActive) => handleCategoryToggle(group.category!.id, isActive)}
                              aria-label={`Alternar status da categoria ${title}`}
                            />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleGroupExpanded(group.key)}
                          className={`w-8 h-8 flex items-center justify-center rounded-full bg-card border border-border transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                        >
                          <ChevronDown size={16} className="text-foreground" />
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                        {/* Mobile View: Cards */}
                        <div className={`md:hidden p-3 space-y-3 ${group.category?.isActive === false ? 'opacity-50' : ''}`}>
                          {renderCards(group.products)}
                        </div>

                        {/* Desktop View: Table */}
                        <div className={`hidden md:block max-h-[60vh] overflow-auto custom-scrollbar ${group.category?.isActive === false ? 'opacity-50' : ''}`}>
                          <table className="w-full text-left border-collapse">
                            <thead className="bg-card border-b border-border sticky top-0 z-10">
                              <tr>
                                {isBulkMode && (
                                  <th className="px-4 py-4 text-[10px] font-black text-muted-foreground uppercase tracking-widest">Selecionar</th>
                                )}
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
            <h3 className="text-sm font-black text-foreground mb-2">Status de venda</h3>
            <p className="text-xs text-muted-foreground mb-2">Estes são os únicos estados operacionais exibidos para a equipe.</p>
            <ul className="text-xs text-muted-foreground dark:text-muted-foreground space-y-1">
              <li><span className="font-bold text-foreground dark:text-muted-foreground">Ativo:</span> aparece nos canais e pode ser vendido.</li>
              <li><span className="font-bold text-foreground dark:text-muted-foreground">Pausado:</span> não aparece nos canais e não pode ser vendido.</li>
              <li><span className="font-bold text-foreground dark:text-muted-foreground">Esgotado:</span> item sem venda disponível no momento.</li>
            </ul>
          </div>

          <div className="bg-muted/50 dark:bg-muted/80 border border-border dark:border-border/80 rounded-xl p-3">
            <p className="text-xs text-muted-foreground dark:text-muted-foreground">
              <span className="font-black">Dica:</span> use Pausado para retirar um item da operação e Esgotado para manter o cadastro pronto para reativação.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
