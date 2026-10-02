import { memo, useEffect, useState } from 'react';
import { X, Trash2, Plus, Minus, Save, Search, PlusCircle, AlertCircle } from 'lucide-react';
import type { 
  OrderResponseDTO, 
  OrderItemResponseDTO, 
  CreateOrderItemDTO,
  EditOrderOperationDTO,
} from '@gestor/types';
import { api } from '../../../lib/api-client';
import { PosItemConfiguratorModal } from '../../pos/components/PosItemConfiguratorModal';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getProductConfigurationRoute } from '@gestor/utils';

export interface EditOrderModalProps {
  order: OrderResponseDTO | null;
  onClose: () => void;
  onSaved: () => void;
}

interface EditableItem {
  id: string; // ID real do item no pedido original
  lineType: 'product' | 'combo';
  productId?: string;
  comboId?: string;
  quantity: number;
  unitPrice: number;
  name: string;
  notes?: string;
  lineTotal: number;
  isNew?: boolean;
  payload?: CreateOrderItemDTO; // DTO completo para itens novos ou alterados drasticamente
}

interface CatalogProduct {
  id: string;
  name: string;
  basePrice: number;
  image: string | null;
  type: 'simple' | 'configurable' | 'combo';
  categoryTemplateType?: 'none' | 'pizza' | 'combo' | null;
  activeOptionGroupCount: number;
}

interface CatalogProductListResponse {
  id: string;
  name: string;
  basePrice: number;
  image?: string | null;
  type?: CatalogProduct['type'];
  category?: { templateType?: CatalogProduct['categoryTemplateType'] } | null;
  _count?: { optionGroupLinks?: number };
}

const mapItemToEditable = (item: OrderItemResponseDTO): EditableItem => {
  return {
    id: item.id,
    lineType: item.lineType,
    productId: item.productId || undefined,
    comboId: item.comboId || undefined,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    name: item.snapshotName,
    notes: item.notes || undefined,
    lineTotal: item.lineTotal,
  };
};

export const EditOrderModal = memo(function EditOrderModal({ order, onClose, onSaved }: EditOrderModalProps) {
  const [items, setItems] = useState<EditableItem[]>([]);
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  
  // Produto sendo configurado
  const [configProductId, setConfigProductId] = useState<string | null>(null);
  
  // Busca de produtos
  const [searchTerm, setSearchTerm] = useState('');
  const [showProductSearch, setShowProductSearch] = useState(false);

  const { data: products } = useQuery<CatalogProduct[]>({
    queryKey: ['catalog-search', searchTerm],
    queryFn: async () => {
      if (searchTerm.length < 2) return [];
      const res = await api.get<CatalogProductListResponse[]>(`/catalog/products?search=${encodeURIComponent(searchTerm)}&limit=10`);
      return (res.data || []).map((p) => ({
        id: p.id,
        name: p.name,
        basePrice: Number(p.basePrice || 0),
        image: p.image || null,
        type: p.type || 'simple',
        categoryTemplateType: p.category?.templateType || null,
        activeOptionGroupCount: Number(p._count?.optionGroupLinks ?? 0),
      }));
    },
    enabled: searchTerm.length >= 2,
  });

  useEffect(() => {
    if (order) {
      setItems(order.items.map(mapItemToEditable));
      setError('');
    }
  }, [order]);

  if (!order) return null;

  const handleUpdateQuantity = (id: string, delta: number) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        const newQ = Math.max(1, item.quantity + delta);
        return {
          ...item,
          quantity: newQ,
          lineTotal: newQ * item.unitPrice
        };
      }
      return item;
    }));
  };

  const handleRemove = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const handleAddProduct = (product: CatalogProduct) => {
    if (getProductConfigurationRoute(product) !== 'direct') {
      setConfigProductId(product.id);
    } else {
      const newItem: EditableItem = {
        id: `new-${Date.now()}`,
        lineType: 'product',
        productId: product.id,
        quantity: 1,
        unitPrice: product.basePrice,
        name: product.name,
        lineTotal: product.basePrice,
        isNew: true,
        payload: {
          lineType: 'product',
          productId: product.id,
          quantity: 1,
        }
      };
      setItems(prev => [...prev, newItem]);
      setShowProductSearch(false);
      setSearchTerm('');
    }
  };

  interface ConfiguratorResult {
    lineType: 'product' | 'combo';
    productId: string;
    quantity: number;
    computedUnitPrice: number;
    name: string;
    notes?: string;

    selections?: CreateOrderItemDTO['selections'];
    pizzaComposition?: CreateOrderItemDTO['pizzaComposition'];
    slots?: CreateOrderItemDTO['slots'];
  }

  const handleConfigConfirm = (result: ConfiguratorResult) => {
    const newItem: EditableItem = {
      id: `new-${Date.now()}`,
      lineType: result.lineType,
      productId: result.lineType === 'product' ? result.productId : undefined,
      comboId: result.lineType === 'combo' ? result.productId : undefined,
      quantity: result.quantity,
      unitPrice: result.computedUnitPrice,
      name: result.name,
      notes: result.notes,
      lineTotal: result.computedUnitPrice * result.quantity,
      isNew: true,
      payload: {
        lineType: result.lineType,
        productId: result.productId,
        quantity: result.quantity,
        notes: result.notes,

        selections: result.selections,
        pizzaComposition: result.pizzaComposition,
        slots: result.slots,
      }
    };
    setItems(prev => [...prev, newItem]);
    setConfigProductId(null);
    setShowProductSearch(false);
    setSearchTerm('');
  };

  const currentTotal = order.total;
  const newItemsSubtotal = items.reduce((sum, i) => sum + i.lineTotal, 0);
  // Estimativa simples do novo total (mantendo taxas e descontos do pedido original)
  const totalDifference = newItemsSubtotal - order.itemsSubtotal;
  const estimatedNewTotal = Math.max(0, currentTotal + totalDifference);

  const handleSave = async () => {
    if (items.length === 0) {
      setError('O pedido deve ter pelo menos 1 item.');
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      
      const operations: EditOrderOperationDTO[] = [];

      // 1. Itens removidos
      const currentIds = items.map(i => i.id);
      order.items.forEach(original => {
        if (!currentIds.includes(original.id)) {
          operations.push({ type: 'remove_item', orderItemId: original.id });
        }
      });

      // 2. Itens alterados (quantidade ou nota)
      items.filter(i => !i.isNew).forEach(item => {
        const original = order.items.find(o => o.id === item.id);
        if (original) {
          if (item.quantity !== original.quantity) {
            operations.push({ type: 'update_quantity', orderItemId: item.id, quantity: item.quantity });
          }
          if (item.notes !== original.notes) {
            operations.push({ type: 'update_item_notes', orderItemId: item.id, notes: item.notes });
          }
        }
      });

      // 3. Itens novos
      items.filter(i => i.isNew).forEach(item => {
        if (item.payload) {
          operations.push({ type: 'add_item', payload: item.payload });
        }
      });

      if (operations.length === 0 && !reason) {
        onClose();
        return;
      }

      await api.patch(`/orders/${order.id}/edit`, { operations, reason });
      toast.success('Pedido atualizado com sucesso!');
      onSaved();
      onClose();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError(e.response?.data?.message || e.message || 'Erro ao salvar pedido');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 safe-modal bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card rounded-[32px] shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[calc(100dvh-var(--safe-area-top)-var(--safe-area-bottom)-2rem)] border border-border">
        
        <header className="px-8 py-6 border-b border-border flex items-center justify-between bg-muted/50 shrink-0">
          <div>
            <h2 className="text-xl font-black text-foreground">Editar Pedido #{order.orderNumber}</h2>
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1">Gerenciamento de Itens e Quantidades</p>
          </div>
          <button onClick={onClose} disabled={isSaving} className="p-3 hover:bg-muted rounded-2xl transition-all">
            <X className="w-6 h-6 text-muted-foreground" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
          {error && (
            <div className="mb-6 p-4 rounded-2xl bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 text-sm font-bold border border-red-100 dark:border-red-900/30 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              {error}
            </div>
          )}

          {/* Seletor de Produtos */}
          <div className="mb-8">
            <div className="relative">
              <button 
                onClick={() => setShowProductSearch(!showProductSearch)}
                className="w-full p-4 bg-primary-50 dark:bg-primary-900/10 border-2 border-dashed border-primary-200 dark:border-primary-900/30 rounded-2xl flex items-center justify-center gap-3 text-primary-600 dark:text-primary-400 font-black text-sm uppercase tracking-widest hover:bg-primary-100 dark:hover:bg-primary-900/20 transition-all group"
              >
                <PlusCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
                Adicionar Produto ao Pedido
              </button>

              {showProductSearch && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-2xl shadow-2xl z-50 p-4 animate-in slide-in-from-top-2">
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <input 
                      autoFocus
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Buscar produto pelo nome..."
                      className="w-full pl-10 pr-4 py-3 bg-muted border border-border rounded-xl text-sm outline-none focus:border-primary-500"
                    />
                  </div>

                  <div className="space-y-1 max-h-60 overflow-y-auto custom-scrollbar">
                    {products?.map(p => (
                      <button 
                        key={p.id}
                        onClick={() => handleAddProduct(p)}
                        className="w-full p-3 flex items-center justify-between hover:bg-muted rounded-xl transition-colors"
                      >
                        <div className="text-left">
                          <p className="text-sm font-bold text-foreground">{p.name}</p>
                          <p className="text-xs text-muted-foreground">R$ {p.basePrice.toFixed(2)}</p>
                        </div>
                        <Plus className="w-4 h-4 text-primary" />
                      </button>
                    ))}
                    {searchTerm.length >= 2 && products?.length === 0 && (
                      <p className="text-center py-4 text-xs text-muted-foreground font-medium">Nenhum produto encontrado.</p>
                    )}
                    {searchTerm.length < 2 && (
                      <p className="text-center py-4 text-xs text-muted-foreground font-medium">Digite pelo menos 2 letras...</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">Itens do Pedido</h3>
            {items.map(item => (
              <div key={item.id} className="p-5 rounded-3xl bg-card border border-border shadow-sm hover:shadow-md transition-all group">
                <div className="flex gap-5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-black text-foreground text-base truncate">
                        {item.name}
                      </p>
                      {item.isNew && (
                        <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase rounded-lg">Novo</span>
                      )}
                    </div>
                    <p className="text-xs font-bold text-muted-foreground mt-1">
                      Unitário: R$ {item.unitPrice.toFixed(2)}
                    </p>
                    {item.notes && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-3 bg-amber-50 dark:bg-amber-900/20 p-3 rounded-xl border border-amber-100 dark:border-amber-900/30">
                        <span className="font-black uppercase text-[9px] block mb-1 opacity-60">Observação do Item:</span>
                        {item.notes}
                      </p>
                    )}
                  </div>
                  
                  <div className="shrink-0 flex flex-col items-end gap-4">
                    <p className="font-black text-foreground text-lg">
                      R$ {item.lineTotal.toFixed(2)}
                    </p>
                    
                    <div className="flex items-center gap-1 bg-muted p-1 rounded-2xl border border-border">
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity(item.id, -1)}
                        className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-card text-foreground transition-all active:scale-90"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-8 text-center font-black text-sm">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity(item.id, 1)}
                        className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-card text-foreground transition-all active:scale-90"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemove(item.id)}
                      className="text-[10px] font-black text-red-500 hover:text-red-700 uppercase tracking-widest flex items-center gap-1.5 transition-colors opacity-60 group-hover:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remover Item
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Motivo da Alteração */}
          <div className="mt-8 pt-8 border-t border-border">
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground block mb-3">Motivo da Alteração (Obrigatório)</label>
            <textarea 
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Cliente solicitou via WhatsApp; Erro na digitação original..."
              className="w-full p-4 bg-muted border border-border rounded-2xl text-sm outline-none focus:border-primary min-h-[100px] transition-all"
            />
          </div>
        </div>

        {/* Resumo Financeiro no Footer */}
        <footer className="p-8 bg-muted dark:bg-muted/40 border-t border-border flex flex-col md:flex-row items-center gap-6 shrink-0">
          <div className="flex-1 flex gap-8 items-center">
            <div className="text-center md:text-left">
              <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest mb-1">Total Anterior</p>
              <p className="text-lg font-bold text-muted-foreground line-through decoration-muted">R$ {currentTotal.toFixed(2)}</p>
            </div>
            <div className="w-px h-10 bg-border hidden md:block" />
            <div className="text-center md:text-left">
              <p className="text-[9px] font-black uppercase text-primary tracking-widest mb-1">Novo Total (Est.)</p>
              <p className="text-2xl font-black text-foreground">R$ {estimatedNewTotal.toFixed(2)}</p>
            </div>
            <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${totalDifference >= 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
              {totalDifference >= 0 ? '+' : ''} R$ {totalDifference.toFixed(2)}
            </div>
          </div>

          <div className="flex gap-3 w-full md:w-auto">
            <button
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 md:flex-none px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-muted-foreground hover:bg-muted transition-all active:scale-95"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !reason.trim()}
              className="flex-1 md:flex-none px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center gap-3 shadow-lg shadow-primary-950/20 transition-all active:scale-95 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              ) : (
                <Save className="w-5 h-5" />
              )}
              {isSaving ? 'Salvando...' : 'Confirmar Edição'}
            </button>
          </div>
        </footer>
      </div>

      {/* Configurator Modal */}
      {configProductId && (
        <PosItemConfiguratorModal
          isOpen={!!configProductId}
          productId={configProductId}
          onClose={() => setConfigProductId(null)}
          onConfirm={handleConfigConfirm}
        />
      )}
    </div>
  );
});
