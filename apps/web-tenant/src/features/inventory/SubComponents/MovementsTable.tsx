import { useState, useEffect } from 'react';
import { api } from '../../../lib/api-client';
import { StockMovementDTO, StockMovementType } from '@gestor/types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { LucideIcon, ArrowUpCircle, ArrowDownCircle, RefreshCcw, Trash2, ShoppingCart, ClipboardList } from 'lucide-react';

export function MovementsTable() {
  const [movements, setMovements] = useState<Array<StockMovementDTO & { ingredient?: { name: string } }>>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadMovements();
  }, []);

  const loadMovements = async () => {
    setIsLoading(true);
    try {
      const res = await api.get<StockMovementDTO[]>('/inventory/movements');
      if (res.success) setMovements(res.data);
    } catch (err) {
      console.error('Erro ao carregar movimentações:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const typeMap: Record<StockMovementType, { label: string, color: string, icon: LucideIcon }> = {
    [StockMovementType.IN]: { label: 'Entrada', color: 'text-green-600 bg-green-50', icon: ArrowUpCircle },
    [StockMovementType.OUT]: { label: 'Saída', color: 'text-red-600 bg-red-50', icon: ArrowDownCircle },
    [StockMovementType.ADJUST]: { label: 'Ajuste', color: 'text-blue-600 bg-blue-50', icon: RefreshCcw },
    [StockMovementType.WASTE]: { label: 'Perda/Desperdício', color: 'text-amber-600 bg-amber-50', icon: Trash2 },
    [StockMovementType.THEORETICAL_DEPLETION]: { label: 'Baixa de Pedido', color: 'text-purple-600 bg-purple-50', icon: ShoppingCart },
    [StockMovementType.THEORETICAL_REVERSAL]: { label: 'Estorno de Pedido', color: 'text-teal-600 bg-teal-50', icon: RefreshCcw },
    [StockMovementType.PURCHASE_ENTRY]: { label: 'Compra', color: 'text-emerald-600 bg-emerald-50', icon: ShoppingCart },
    [StockMovementType.INVENTORY_ADJUSTMENT]: { label: 'Inventário', color: 'text-indigo-600 bg-indigo-50', icon: ClipboardList },
  };

  if (isLoading) return (
    <div className="flex justify-center items-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
    </div>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead className="bg-gray-50 dark:bg-gray-900/50 border-b border-gray-100 dark:border-gray-800">
          <tr>
            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Data</th>
            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Tipo</th>
            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Insumo</th>
            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Qtd</th>
            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Origem/Observação</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {movements.map((m) => {
            const type = typeMap[m.type as StockMovementType] || typeMap[StockMovementType.ADJUST];
            return (
              <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <td className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400">
                  {format(new Date(m.createdAt), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${type.color}`}>
                    <type.icon size={12} />
                    {type.label}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm font-bold text-gray-900 dark:text-gray-100">
                  {m.ingredient?.name || 'Insumo #'+m.ingredientId.slice(0,4)}
                </td>
                <td className={`px-6 py-4 text-sm font-black text-right ${['out', 'waste', 'theoretical_depletion'].includes(m.type) ? 'text-red-500' : 'text-green-500'}`}>
                  {['out', 'waste', 'theoretical_depletion'].includes(m.type) ? '-' : '+'}{m.quantity}
                </td>
                <td className="px-6 py-4 text-xs text-gray-500 dark:text-gray-400 italic">
                  {m.notes || (m.orderId ? `Pedido #${m.orderId.slice(0,4)}` : '-')}
                </td>
              </tr>
            );
          })}
          {movements.length === 0 && (
            <tr>
              <td colSpan={5} className="px-6 py-12 text-center text-gray-400 italic">
                Nenhuma movimentação registrada.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
