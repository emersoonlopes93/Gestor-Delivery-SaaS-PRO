import { useState } from 'react';
import { CustomerSearchBox } from './CustomerSearchBox';
import { CustomerCashbackPanel } from './CustomerCashbackPanel';
import { CustomerWalletPanel } from './CustomerWalletPanel';
import { CustomerLoyaltyPanel } from './CustomerLoyaltyPanel';
import { UserX } from 'lucide-react';

interface CustomerOption {
  id: string;
  name: string;
  phone: string;
}

interface CustomerBalancePanelProps {
  mode: 'wallet-cashback' | 'loyalty';
}

export function CustomerBalancePanel({ mode }: CustomerBalancePanelProps) {
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end gap-4 bg-muted/30 p-4 rounded-xl border border-border">
        <div className="flex-1 w-full max-w-md">
          <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-2">
            Pesquisar Cliente
          </label>
          <CustomerSearchBox onSelect={(customer) => setSelectedCustomer(customer)} />
        </div>
        {selectedCustomer && (
          <div className="flex items-center gap-4 bg-card px-4 py-2 rounded-xl shadow-sm border border-border">
            <div>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Cliente Selecionado</p>
              <p className="text-sm font-bold text-foreground">{selectedCustomer.name}</p>
            </div>
            <button 
              onClick={() => setSelectedCustomer(null)}
              className="p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors"
              title="Limpar seleção"
            >
              <UserX size={16} />
            </button>
          </div>
        )}
      </div>

      {!selectedCustomer ? (
        <div className="p-12 text-center border-2 border-dashed border-border rounded-xl bg-card/50">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4 text-muted-foreground">
            <Search size={24} />
          </div>
          <h3 className="text-lg font-bold text-foreground mb-1">Nenhum cliente selecionado</h3>
          <p className="text-sm text-muted-foreground">
            Use a barra de pesquisa acima para encontrar um cliente e visualizar seus saldos e extratos.
          </p>
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in duration-300">
          {mode === 'wallet-cashback' ? (
            <>
              <div>
                <CustomerWalletPanel customerId={selectedCustomer.id} customerName={selectedCustomer.name} />
              </div>
              <div className="h-px bg-border w-full my-8" />
              <div>
                <CustomerCashbackPanel customerId={selectedCustomer.id} customerName={selectedCustomer.name} />
              </div>
            </>
          ) : (
            <CustomerLoyaltyPanel customerId={selectedCustomer.id} customerName={selectedCustomer.name} />
          )}
        </div>
      )}
    </div>
  );
}

// Dummy import since lucide-react Search was used in empty state
import { Search } from 'lucide-react';
