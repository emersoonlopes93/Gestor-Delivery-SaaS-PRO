import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { OptionGroup, OptionItem, Product } from '@gestor/types';
import { Modal } from '../../../components/Modal';
import { api } from '../../../lib/api-client';
import {
  Search,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Layers,
  ArrowLeft,
  CheckSquare,
  Square,
  Package,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface LinkedProductItem {
  id: string; // linkId
  productId: string;
  product: {
    id: string;
    name: string;
    type?: string;
    isActive: boolean;
  };
}

interface GroupDetailResponse extends OptionGroup {
  items?: OptionItem[];
  productLinks?: LinkedProductItem[];
  _count?: { optionGroupLinks: number };
}

interface LinkedProductsModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: OptionGroup & { items?: OptionItem[]; _count?: { optionGroupLinks: number } };
  onUpdated: () => void;
}

export const LinkedProductsModal: React.FC<LinkedProductsModalProps> = ({
  isOpen,
  onClose,
  group,
  onUpdated,
}) => {
  const [view, setView] = useState<'linked_list' | 'link_products'>('linked_list');

  const [groupDetail, setGroupDetail] = useState<GroupDetailResponse | null>(null);
  const [allProducts, setAllProducts] = useState<Product[]>([]);

  const [isLoadingGroup, setIsLoadingGroup] = useState(true);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isSubmittingLinks, setIsSubmittingLinks] = useState(false);
  const [unlinkingLinkId, setUnlinkingLinkId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
    failures?: string[];
  } | null>(null);

  const loadGroupDetail = useCallback(async () => {
    setIsLoadingGroup(true);
    try {
      const res = await api.get<GroupDetailResponse>(`/catalog/option-groups/${group.id}`);
      if (res.success) {
        setGroupDetail(res.data);
      }
    } catch (err) {
      console.error('Erro ao carregar detalhes do grupo:', err);
    } finally {
      setIsLoadingGroup(false);
    }
  }, [group.id]);

  const loadProducts = useCallback(async () => {
    setIsLoadingProducts(true);
    try {
      const res = await api.get<Product[]>('/catalog/products');
      if (res.success) {
        setAllProducts(res.data);
      }
    } catch (err) {
      console.error('Erro ao carregar lista de produtos:', err);
    } finally {
      setIsLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setView('linked_list');
      setSearchQuery('');
      setSelectedProductIds(new Set());
      setFeedback(null);
      loadGroupDetail();
      loadProducts();
    }
  }, [isOpen, loadGroupDetail, loadProducts]);

  // Derived datasets
  const linkedProductLinks = useMemo(() => {
    return groupDetail?.productLinks ?? [];
  }, [groupDetail]);

  const linkedProductIdsSet = useMemo(() => {
    return new Set(linkedProductLinks.map((l) => l.productId));
  }, [linkedProductLinks]);

  const usageCount = linkedProductLinks.length;

  // Products filtered for the search query
  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return allProducts;
    return allProducts.filter((p) => p.name.toLowerCase().includes(q));
  }, [allProducts, searchQuery]);

  // Unlinked & available products
  const availableProducts = useMemo(() => {
    return filteredProducts.filter((p) => !linkedProductIdsSet.has(p.id));
  }, [filteredProducts, linkedProductIdsSet]);

  const isAllVisibleSelected = useMemo(() => {
    if (availableProducts.length === 0) return false;
    return availableProducts.every((p) => selectedProductIds.has(p.id));
  }, [availableProducts, selectedProductIds]);

  const toggleSelectProduct = (productId: string) => {
    if (linkedProductIdsSet.has(productId)) return; // Already linked
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    if (isAllVisibleSelected) {
      setSelectedProductIds((prev) => {
        const next = new Set(prev);
        availableProducts.forEach((p) => next.delete(p.id));
        return next;
      });
    } else {
      setSelectedProductIds((prev) => {
        const next = new Set(prev);
        availableProducts.forEach((p) => next.add(p.id));
        return next;
      });
    }
  };

  const handleBulkLink = async () => {
    if (selectedProductIds.size === 0) return;
    setIsSubmittingLinks(true);
    setFeedback(null);

    const productIdsToLink = Array.from(selectedProductIds);
    let successCount = 0;
    const failures: string[] = [];

    const results = await Promise.allSettled(
      productIdsToLink.map(async (pId) => {
        const product = allProducts.find((p) => p.id === pId);
        const name = product?.name ?? pId;
        const res = await api.post(`/catalog/products/${pId}/option-groups`, {
          optionGroupId: group.id,
        });
        if (!res.success) {
          throw new Error(name);
        }
        return name;
      })
    );

    results.forEach((r, idx) => {
      const pId = productIdsToLink[idx];
      const product = allProducts.find((p) => p.id === pId);
      const name = product?.name ?? pId;

      if (r.status === 'fulfilled') {
        successCount++;
      } else {
        failures.push(name);
      }
    });

    if (failures.length === 0) {
      toast.success(`${successCount} ${successCount === 1 ? 'produto vinculado' : 'produtos vinculados'} com sucesso!`);
      setSelectedProductIds(new Set());
      setView('linked_list');
    } else if (successCount > 0) {
      setFeedback({
        type: 'warning',
        message: `${successCount} de ${productIdsToLink.length} produtos foram vinculados.`,
        failures,
      });
      setSelectedProductIds((prev) => {
        const next = new Set(prev);
        // keep only failures in selection
        productIdsToLink.forEach((id) => {
          const product = allProducts.find((p) => p.id === id);
          if (product && !failures.includes(product.name)) {
            next.delete(id);
          }
        });
        return next;
      });
    } else {
      setFeedback({
        type: 'error',
        message: 'Não foi possível vincular os produtos selecionados.',
        failures,
      });
    }

    setIsSubmittingLinks(false);
    await loadGroupDetail();
    onUpdated();
  };

  const handleUnlinkProduct = async (linkId: string, productId: string, productName: string) => {
    if (!window.confirm(`Desvincular o grupo "${group.name}" do produto "${productName}"?`)) {
      return;
    }

    setUnlinkingLinkId(linkId);
    try {
      await api.delete(`/catalog/products/${productId}/option-groups/${linkId}`);
      toast.success(`Grupo desvinculado de "${productName}".`);
      await loadGroupDetail();
      onUpdated();
    } catch (err) {
      console.error('Erro ao desvincular produto:', err);
      toast.error('Não foi possível desvincular o produto.');
    } finally {
      setUnlinkingLinkId(null);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={view === 'linked_list' ? 'Produtos vinculados' : `Vincular "${group.name}" a produtos`}
      maxWidth="max-w-2xl"
      footer={
        view === 'linked_list' ? (
          <>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted rounded-lg transition-colors"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setView('link_products');
              }}
              className="btn-primary px-5 py-2.5 text-sm font-bold flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Vincular a outros produtos
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setView('linked_list')}
              disabled={isSubmittingLinks}
              className="px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted rounded-lg transition-colors flex items-center gap-1.5"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </button>
            <button
              type="button"
              onClick={handleBulkLink}
              disabled={isSubmittingLinks || selectedProductIds.size === 0}
              className="btn-primary px-6 py-2.5 text-sm font-bold flex items-center gap-2 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSubmittingLinks ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-primary-foreground" />
                  Vinculando {selectedProductIds.size} {selectedProductIds.size === 1 ? 'produto' : 'produtos'}...
                </>
              ) : (
                <>Vincular {selectedProductIds.size} {selectedProductIds.size === 1 ? 'produto' : 'produtos'}</>
              )}
            </button>
          </>
        )
      }
    >
      <div className="space-y-5 text-left">
        {/* Header Info Banner */}
        <div className="flex items-center justify-between p-4 bg-muted/30 border border-border rounded-2xl">
          <div>
            <h4 className="font-black text-foreground text-base tracking-tight">{group.name}</h4>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">
              Crie uma vez e reutilize em vários produtos.
            </p>
          </div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20 shrink-0">
            <Layers className="w-3.5 h-3.5" />
            <span>
              {usageCount === 0
                ? 'Ainda não utilizado'
                : usageCount === 1
                ? 'Usado em 1 produto'
                : `Usado em ${usageCount} produtos`}
            </span>
          </div>
        </div>

        {/* Feedback Banner if partial error */}
        {feedback && (
          <div
            className={`p-4 rounded-xl border text-xs leading-relaxed ${
              feedback.type === 'warning'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                : 'bg-destructive/10 border-destructive/20 text-destructive'
            }`}
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-sm mb-1">{feedback.message}</p>
                {feedback.failures && feedback.failures.length > 0 && (
                  <ul className="list-disc list-inside space-y-0.5 opacity-90 mt-1">
                    {feedback.failures.map((f, i) => (
                      <li key={i}>Não foi possível vincular: {f}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              view === 'linked_list'
                ? 'Buscar nos produtos vinculados...'
                : 'Buscar produtos para vincular...'
            }
            className="w-full pl-10 pr-4 py-2.5 bg-card text-foreground text-sm font-medium border border-border rounded-xl outline-none focus:ring-2 focus:ring-primary transition-all placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
            >
              Limpar
            </button>
          )}
        </div>

        {/* VIEW 1: LINKED PRODUCTS LIST */}
        {view === 'linked_list' && (
          <div>
            {isLoadingGroup ? (
              <div className="flex justify-center items-center h-40">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : linkedProductLinks.length > 0 ? (
              <div className="border border-border rounded-xl overflow-hidden bg-card divide-y divide-border/60 max-h-80 overflow-y-auto custom-scrollbar">
                {linkedProductLinks
                  .filter((l) =>
                    !searchQuery.trim() ||
                    l.product.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
                  )
                  .map((l) => (
                    <div
                      key={l.id}
                      className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                          <Package className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-foreground truncate">{l.product.name}</p>
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-bold ${
                              l.product.isActive !== false ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${l.product.isActive !== false ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
                            {l.product.isActive !== false ? 'Produto ativo' : 'Produto inativo'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Vinculado
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUnlinkProduct(l.id, l.productId, l.product.name)}
                          disabled={unlinkingLinkId === l.id}
                          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                          title="Desvincular produto"
                        >
                          {unlinkingLinkId === l.id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-destructive" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="py-10 bg-card border border-dashed border-border rounded-xl text-center space-y-3 p-6">
                <Layers className="w-8 h-8 text-muted-foreground mx-auto" />
                <p className="text-sm font-bold text-foreground">Nenhum produto vinculado a este grupo ainda.</p>
                <p className="text-xs text-muted-foreground font-medium">
                  Clique no botão abaixo para vincular este grupo a um ou vários produtos do seu cardápio.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setView('link_products');
                  }}
                  className="btn-primary px-5 py-2 text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Vincular a produtos
                </button>
              </div>
            )}
          </div>
        )}

        {/* VIEW 2: MULTI-SELECT PRODUCTS TO LINK */}
        {view === 'link_products' && (
          <div className="space-y-3">
            {/* Select All Bar */}
            <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border border-border rounded-xl text-xs font-bold text-muted-foreground">
              <button
                type="button"
                onClick={toggleSelectAllVisible}
                disabled={availableProducts.length === 0}
                className="flex items-center gap-2 text-foreground hover:text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAllVisibleSelected ? (
                  <CheckSquare className="w-4 h-4 text-primary" />
                ) : (
                  <Square className="w-4 h-4 text-muted-foreground" />
                )}
                <span>Selecionar todos visíveis ({availableProducts.length})</span>
              </button>

              <span>
                {selectedProductIds.size} {selectedProductIds.size === 1 ? 'selecionado' : 'selecionados'}
              </span>
            </div>

            {/* Products Selection List */}
            {isLoadingProducts ? (
              <div className="flex justify-center items-center h-40">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : filteredProducts.length > 0 ? (
              <div className="border border-border rounded-xl overflow-hidden bg-card divide-y divide-border/60 max-h-80 overflow-y-auto custom-scrollbar">
                {filteredProducts.map((p) => {
                  const isAlreadyLinked = linkedProductIdsSet.has(p.id);
                  const isSelected = selectedProductIds.has(p.id);

                  return (
                    <div
                      key={p.id}
                      onClick={() => !isAlreadyLinked && toggleSelectProduct(p.id)}
                      className={`px-4 py-3 flex items-center justify-between gap-3 transition-colors ${
                        isAlreadyLinked
                          ? 'bg-muted/20 opacity-70 cursor-not-allowed'
                          : isSelected
                          ? 'bg-primary/10 border-l-4 border-l-primary cursor-pointer'
                          : 'hover:bg-muted/30 cursor-pointer'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isAlreadyLinked || isSelected}
                          disabled={isAlreadyLinked}
                          onChange={() => !isAlreadyLinked && toggleSelectProduct(p.id)}
                          className="w-4 h-4 text-primary rounded cursor-pointer disabled:cursor-not-allowed"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-foreground truncate">{p.name}</p>
                          <span className="text-[10px] text-muted-foreground font-medium">
                            {p.isActive !== false ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {isAlreadyLinked ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-muted text-muted-foreground border border-border">
                            Já vinculado
                          </span>
                        ) : isSelected ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-primary text-primary-foreground">
                            Selecionado
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-10 bg-card border border-dashed border-border rounded-xl text-center space-y-2 p-6">
                <Package className="w-8 h-8 text-muted-foreground mx-auto" />
                <p className="text-sm font-bold text-foreground">
                  {allProducts.length === 0
                    ? 'Nenhum produto cadastrado no cardápio.'
                    : 'Nenhum produto encontrado.'}
                </p>
                <p className="text-xs text-muted-foreground font-medium">
                  {allProducts.length === 0
                    ? 'Cadastre produtos antes de vincular este grupo.'
                    : 'Tente outro termo na busca.'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
