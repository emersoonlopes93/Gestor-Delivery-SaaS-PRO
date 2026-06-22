import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import { ArrowDown, ArrowUp, Plus, Minus, DollarSign } from 'lucide-react';
import { BalanceAdjustmentModal } from './BalanceAdjustmentModal';

interface CashbackTransaction {
  id: string;
  type: 'earned' | 'redeemed' | 'expired' | 'refunded';
  amount: number;
  description: string;
  createdAt: string;
}

interface CustomerCashbackPanelProps {
  customerId: string;
  customerName: string;
}

export function CustomerCashbackPanel({ customerId, customerName }: CustomerCashbackPanelProps) {
  const [transactions, setTransactions] = useState<CashbackTransaction[]>([]);
  const [balance, setBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  
  const [modalType, setModalType] = useState<'add' | 'remove' | null>(null);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const res = await api.get<{ balance: number; transactions: CashbackTransaction[] }>(`/promotions/cashback/customer/${customerId}`);
      // Assuming backend returns { balance, transactions }
      if (res.success && res.data) {
        setBalance(res.data.balance || 0);
        setTransactions(res.data.transactions || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (customerId) loadData();
  }, [customerId]);

  const handleAdjustment = async (amount: number, description: string) => {
    const type = modalType === 'add' ? 'earned' : 'redeemed';
    // POST /promotions/cashback/customer/:customerId/adjustment
    await api.post(`/promotions/cashback/customer/${customerId}/adjustment`, {
      amount,
      description,
      type
    });
    await loadData();
  };

  const fmt = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  if (isLoading) return <div className="p-12 text-center animate-pulse text-muted-foreground">Carregando extrato de cashback...</div>;

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Balance Card */}
        <div className="card-premium p-6 flex flex-col justify-between border-l-4 border-l-blue-500 relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 text-blue-500/10 group-hover:scale-110 transition-transform duration-500">
            <DollarSign size={120} />
          </div>
          <div>
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Saldo de Cashback</div>
            <div className="text-4xl font-black text-blue-600 dark:text-blue-500">{fmt(balance)}</div>
            <p className="text-xs text-muted-foreground mt-2 font-medium">Disponível para a próxima compra</p>
          </div>
        </div>

        {/* Actions Card */}
        <div className="card-premium p-6 flex flex-col justify-center gap-3">
          <button 
            onClick={() => setModalType('add')}
            className="w-full flex items-center justify-center gap-2 py-3 bg-green-50 hover:bg-green-100 text-green-700 dark:bg-green-900/20 dark:hover:bg-green-900/40 dark:text-green-400 rounded-xl text-sm font-bold transition-colors"
          >
            <Plus size={16} /> Adicionar Saldo Manualmente
          </button>
          <button 
            onClick={() => setModalType('remove')}
            className="w-full flex items-center justify-center gap-2 py-3 bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-400 rounded-xl text-sm font-bold transition-colors"
          >
            <Minus size={16} /> Abater Saldo Manualmente
          </button>
        </div>
      </div>

      <div className="card-premium overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/20">
          <h3 className="text-sm font-bold text-foreground">Extrato de Transações</h3>
        </div>
        {transactions.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground italic">Nenhuma transação de cashback encontrada para este cliente.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 dark:bg-gray-950 border-b border-border">
              <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                <th className="p-4">Data</th>
                <th className="p-4">Tipo</th>
                <th className="p-4">Descrição</th>
                <th className="p-4 text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {transactions.map(t => (
                <tr key={t.id} className="hover:bg-muted/50 transition-colors">
                  <td className="p-4 text-xs font-mono text-muted-foreground">
                    {new Date(t.createdAt).toLocaleString('pt-BR')}
                  </td>
                  <td className="p-4">
                    {t.type === 'earned' && <span className="status-badge-success text-[10px] flex w-fit items-center gap-1"><ArrowUp size={12}/> Ganho</span>}
                    {t.type === 'redeemed' && <span className="status-badge-danger text-[10px] flex w-fit items-center gap-1"><ArrowDown size={12}/> Resgatado</span>}
                    {t.type === 'expired' && <span className="px-2 py-1 rounded-lg bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 font-bold text-[10px] uppercase tracking-widest">Expirado</span>}
                    {t.type === 'refunded' && <span className="status-badge-warning text-[10px] flex w-fit items-center gap-1"><ArrowUp size={12}/> Estornado</span>}
                  </td>
                  <td className="p-4 text-foreground font-medium">{t.description || '-'}</td>
                  <td className={`p-4 text-right font-black ${t.type === 'earned' || t.type === 'refunded' ? 'text-green-600' : 'text-red-600'}`}>
                    {t.type === 'earned' || t.type === 'refunded' ? '+' : '-'}{fmt(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalType && (
        <BalanceAdjustmentModal
          isOpen={!!modalType}
          onClose={() => setModalType(null)}
          onConfirm={handleAdjustment}
          type="cashback"
          operation={modalType}
          customerName={customerName}
        />
      )}
    </div>
  );
}
