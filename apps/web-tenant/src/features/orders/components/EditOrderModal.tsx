import { memo, useEffect, useState } from 'react';
import { X, Trash2, Plus, Minus, Save } from 'lucide-react';
import type { OrderResponseDTO, OrderItemResponseDTO } from '@gestor/types';
import { api } from '../../../lib/api-client';

export interface EditOrderModalProps {
  order: OrderResponseDTO | null;
  onClose: () => void;
  onSaved: () => void;
}

// Interface própria para itens editáveis no modal — sem estender CreateOrderItemDTO
// pois precisamos de campos de snapshot (name, unitPrice) que não existem no DTO de entrada
interface EditableItem {
  _localId: string;
  lineType: 'product' | 'combo';
  productId?: string;
  comboId?: string;
  quantity: number;
  unitPrice: number;
  basePrice: number;
  name: string;
  image?: string;
  notes?: string;
  lineTotal: number;
}

const mapItemToEditable = (item: OrderItemResponseDTO): EditableItem => {
  return {
    _localId: item.id,
    lineType: item.lineType,
    productId: item.productId || undefined,
    comboId: item.comboId || undefined,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    basePrice: item.snapshotBasePrice,
    name: item.snapshotName,
    image: item.snapshotImage || undefined,
    notes: item.notes || undefined,
    lineTotal: item.lineTotal,
  };
};

export const EditOrderModal = memo(function EditOrderModal({ order, onClose, onSaved }: EditOrderModalProps) {
  const [items, setItems] = useState<EditableItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (order) {
      setItems(order.items.map(mapItemToEditable));
      setError('');
    }
  }, [order]);

  if (!order) return null;

  const handleUpdateQuantity = (localId: string, delta: number) => {
    setItems(prev => prev.map(item => {
      if (item._localId === localId) {
        const newQ = Math.max(0, item.quantity + delta);
        return {
          ...item,
          quantity: newQ,
          lineTotal: newQ * item.unitPrice
        };
      }
      return item;
    }));
  };

  const handleRemove = (localId: string) => {
    setItems(prev => prev.filter(item => item._localId !== localId));
  };

  const handleSave = async () => {
    const validItems = items.filter(i => i.quantity > 0);
    if (validItems.length === 0) {
      setError('O pedido deve ter pelo menos 1 item. Para cancelar, use a opção Cancelar Pedido.');
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      // Envia apenas campos que o EditOrderDTO / CreateOrderItemDTO aceita
      const payload = {
        items: validItems.map(({ _localId: _l, lineTotal: _t, name: _n, image: _i, basePrice: _b, unitPrice: _u, ...rest }) => rest)
      };
      
      await api.patch(`/orders/${order.id}/edit`, payload);
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-800">
        
        <header className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">Editar Pedido #{order.orderNumber}</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Altere quantidades ou remova itens</p>
          </div>
          <button onClick={onClose} disabled={isSaving} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </header>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          {error && (
            <div className="mb-4 p-4 rounded-xl bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 text-sm font-medium border border-red-100 dark:border-red-900/30">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {items.map(item => (
              <div key={item._localId} className={`p-4 rounded-2xl border ${item.quantity === 0 ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 opacity-60' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-sm'} transition-all`}>
                <div className="flex gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-900 dark:text-white truncate">
                      {item.name}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Valor Unitário: R$ {item.unitPrice.toFixed(2)}
                    </p>
                    {item.notes && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-lg">
                        Obs: {item.notes}
                      </p>
                    )}
                  </div>
                  
                  <div className="shrink-0 flex flex-col items-end gap-3">
                    <p className="font-black text-slate-900 dark:text-white">
                      R$ {item.lineTotal.toFixed(2)}
                    </p>
                    
                    <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity(item._localId, -1)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span className="w-6 text-center font-bold text-sm">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateQuantity(item._localId, 1)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemove(item._localId)}
                      className="text-xs font-bold text-red-500 hover:text-red-700 flex items-center gap-1 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" /> Remover
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-primary-50 dark:bg-primary-900/10 rounded-2xl border border-primary-100 dark:border-primary-900/30">
            <p className="text-sm text-primary-700 dark:text-primary-400 font-medium">
              Nota: Ao salvar, o valor do pedido e taxas de entrega serão recalculados automaticamente pelo sistema. Modificações ficarão registradas no histórico do pedido.
            </p>
          </div>
        </div>

        <footer className="p-4 md:p-6 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 flex gap-3 justify-end shrink-0">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-6 py-3 rounded-xl font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-3 rounded-xl font-bold bg-primary-600 text-white hover:bg-primary-700 flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            {isSaving ? (
              <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            {isSaving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </footer>
      </div>
    </div>
  );
});
