import { useState, useEffect } from 'react';
import { ShoppingBag, Plus, CheckCircle2, Package } from 'lucide-react';
import { api } from '../../../lib/api-client';
import { ImagePickerModal } from '../../../components/ImagePickerModal';
import { Step5ImportMenu } from './Step5ImportMenu';
import { maskCurrency, unmaskCurrency } from '@gestor/utils';

interface ProductCategory {
  id: string;
  name: string;
}

interface MinProduct {
  id: string;
  name: string;
  basePrice: number;
  image?: string;
  isActive: boolean;
}

interface ProductDraft {
  name: string;
  basePrice: string;
  shortDescription: string;
  categoryId: string;
  newCategoryName: string;
  imageUrl: string;
  mediaAssetId: string;
}

interface Step5Props {
  onNext: (saveFn: () => Promise<void>) => void;
  onPrev: () => void;
  onMarkValid: (valid: boolean) => void;
}

const EMPTY_DRAFT: ProductDraft = {
  name: '',
  basePrice: '',
  shortDescription: '',
  categoryId: '',
  newCategoryName: '',
  imageUrl: '',
  mediaAssetId: '',
};

type ImportMode = 'choose' | 'manual';

export function Step5Product({ onNext, onPrev, onMarkValid }: Step5Props) {
  const [products, setProducts] = useState<MinProduct[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [draft, setDraft] = useState<ProductDraft>(EMPTY_DRAFT);
  const [showForm, setShowForm] = useState(false);
  const [imagePicker, setImagePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  // 'choose' = tela de importação | 'manual' = form manual
  const [importMode, setImportMode] = useState<ImportMode>('choose');

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    onMarkValid(products.length > 0);
  }, [products, onMarkValid]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [catRes, prodRes] = await Promise.all([
        api.get<ProductCategory[]>('/catalog/categories').catch(() => ({ success: false, data: [] })),
        api.get<MinProduct[]>('/catalog/products').catch(() => ({ success: false, data: [] })),
      ]);
      if (catRes && catRes.success) {
        setCategories(catRes.data || []);
      } else {
        setCategories([]);
      }
      if (prodRes && prodRes.success) {
        const activeProducts = prodRes.data ? prodRes.data.filter(p => p.isActive).slice(0, 10) : [];
        setProducts(activeProducts);
        // Se já tem produtos, vai direto para o modo manual
        if (activeProducts.length > 0) {
          setImportMode('manual');
        }
      }
      if (prodRes && prodRes.success && (!prodRes.data || prodRes.data.length === 0)) {
        setShowForm(false); // não mostrar form até o tenant escolher
      }
    } catch { 
      setCategories([]);
    } finally { 
      setLoading(false); 
    }
  };

  const handleCreateProduct = async () => {
    if (!draft.name.trim()) { alert('Informe o nome do produto.'); return; }
    if (!draft.basePrice || unmaskCurrency(draft.basePrice) <= 0) { alert('Informe um preço válido.'); return; }

    setSaving(true);
    try {
      let categoryId = draft.categoryId;

      // Create new category if needed
      if (!categoryId && draft.newCategoryName.trim()) {
        const catRes = await api.post<{ id: string }>('/catalog/categories', {
          name: draft.newCategoryName.trim(),
          isActive: true,
          order: 0,
        });
        if (catRes.success) {
          categoryId = catRes.data.id;
          setCategories(prev => [...prev, { id: catRes.data.id, name: draft.newCategoryName.trim() }]);
        }
      }

      const res = await api.post<{ id: string; name: string; basePrice: number }>('/catalog/products', {
        name: draft.name.trim(),
        basePrice: unmaskCurrency(draft.basePrice),
        shortDescription: draft.shortDescription.trim() || undefined,
        categoryId: categoryId || undefined,
        image: draft.imageUrl || undefined,
        mediaAssetId: draft.mediaAssetId || undefined,
        isActive: true,
        isAvailable: true,
        sellableOnline: true,
        type: 'simple',
      });

      if (res.success) {
        setProducts(prev => [...prev, {
          id: res.data.id,
          name: res.data.name,
          basePrice: res.data.basePrice,
          isActive: true,
          image: draft.imageUrl || undefined,
        }]);
        setDraft(EMPTY_DRAFT);
        setShowForm(false);
      }
    } catch (err) {
      alert('Erro ao criar produto. Verifique os dados e tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const handleNext = () => {
    if (products.length === 0) {
      alert('Crie pelo menos 1 produto para continuar.');
      return;
    }
    onNext(async () => { /* products already saved individually */ });
  };

  const handleSkip = () => {
    onNext(async () => { /* skip without creating */ });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  // ── Modo: Importação ──────────────────────────────────────────────────────
  if (importMode === 'choose') {
    return (
      <Step5ImportMenu
        onImportComplete={async () => {
          // Recarregar dados após importação e ir para modo manual
          await loadData();
          setImportMode('manual');
        }}
        onSkip={() => {
          setImportMode('manual');
          setShowForm(true);
        }}
        onSkipCompletely={() => {
          onNext(async () => {});
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-2">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-orange-100 dark:bg-orange-900/40 rounded-2xl mb-3">
          <ShoppingBag className="w-7 h-7 text-orange-600 dark:text-orange-400" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white">Produtos Iniciais</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Adicione pelo menos 1 produto ao seu cardápio
        </p>
      </div>

      {/* Existing Products */}
      {products.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
            Produtos criados ({products.length})
          </p>
          {products.map(p => (
            <div key={p.id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              {p.image ? (
                <img src={p.image} alt={p.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                  <Package className="w-5 h-5 text-slate-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm text-slate-900 dark:text-white truncate">{p.name}</div>
                <div className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">R$ {Number(p.basePrice).toFixed(2)}</div>
              </div>
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            </div>
          ))}
        </div>
      )}

      {/* Add Product Form */}
      {showForm ? (
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 space-y-4">
          <p className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">Novo Produto</p>

          {/* Image */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setImagePicker(true)}
              className="w-16 h-16 rounded-xl bg-slate-200 dark:bg-slate-700 border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center overflow-hidden hover:border-indigo-400 transition-colors"
            >
              {draft.imageUrl ? (
                <img src={draft.imageUrl} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <Package className="w-6 h-6 text-slate-400" />
              )}
            </button>
            <div>
              <button onClick={() => setImagePicker(true)} className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                {draft.imageUrl ? 'Alterar imagem' : 'Adicionar imagem'}
              </button>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Opcional</p>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Nome do Produto *</label>
            <input
              type="text"
              value={draft.name}
              onChange={e => setDraft(f => ({ ...f, name: e.target.value }))}
              placeholder="Ex: X-Bacon, Pizza Margherita..."
              className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm"
            />
          </div>

          {/* Price */}
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Preço (R$) *</label>
            <input
              type="text"
              value={draft.basePrice}
              onChange={e => setDraft(f => ({ ...f, basePrice: maskCurrency(e.target.value) }))}
              placeholder="R$ 0,00"
              className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-sm"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Descrição curta</label>
            <input
              type="text"
              value={draft.shortDescription}
              onChange={e => setDraft(f => ({ ...f, shortDescription: e.target.value }))}
              placeholder="Breve descrição para o cardápio..."
              className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-1.5">Categoria</label>
            {categories.length > 0 ? (
              <select
                value={draft.categoryId}
                onChange={e => setDraft(f => ({ ...f, categoryId: e.target.value, newCategoryName: '' }))}
                className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm"
              >
                <option value="">Selecionar categoria existente</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="__new__">+ Criar nova categoria</option>
              </select>
            ) : (
              <input
                type="text"
                value={draft.newCategoryName}
                onChange={e => setDraft(f => ({ ...f, newCategoryName: e.target.value, categoryId: '' }))}
                placeholder="Nome da categoria (ex: Lanches, Bebidas...)"
                className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm"
              />
            )}
            {draft.categoryId === '__new__' && (
              <input
                type="text"
                value={draft.newCategoryName}
                onChange={e => setDraft(f => ({ ...f, newCategoryName: e.target.value, categoryId: '' }))}
                placeholder="Nome da nova categoria..."
                className="w-full mt-2 px-4 py-3 bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm"
              />
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => { setDraft(EMPTY_DRAFT); if (products.length > 0) setShowForm(false); }}
              className="flex-1 py-3 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 font-bold rounded-xl transition-colors text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreateProduct}
              disabled={saving}
              className="flex-[2] py-3 bg-orange-600 hover:bg-orange-700 text-white font-black rounded-xl transition-all shadow-lg shadow-orange-500/20 text-sm disabled:opacity-60"
            >
              {saving ? 'Salvando...' : '+ Adicionar Produto'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full py-4 border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-orange-400 dark:hover:border-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/10 rounded-2xl text-slate-500 dark:text-slate-400 hover:text-orange-600 dark:hover:text-orange-400 font-bold transition-all text-sm flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Adicionar Produto
        </button>
      )}

      <div className="flex gap-3">
        <button onClick={onPrev} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-black rounded-2xl transition-all text-sm">
          ← Voltar
        </button>
        {products.length === 0 && (
          <button
            onClick={handleSkip}
            className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 font-black rounded-2xl transition-all text-sm"
          >
            Pular etapa
          </button>
        )}
        <button
          onClick={handleNext}
          disabled={products.length === 0}
          className="flex-[2] py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-black rounded-2xl transition-all shadow-lg shadow-indigo-500/20 text-sm"
        >
          Continuar →
        </button>
      </div>

      <ImagePickerModal
        isOpen={imagePicker}
        onClose={() => setImagePicker(false)}
        onSelect={(asset) => {
          setDraft(f => ({ ...f, imageUrl: asset.publicUrl, mediaAssetId: asset.id }));
          setImagePicker(false);
        }}
        selectedAssetId={draft.mediaAssetId || undefined}
      />
    </div>
  );
}
