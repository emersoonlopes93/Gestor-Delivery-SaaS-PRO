import { useState } from 'react';
import { Ticket, Wallet, Star } from 'lucide-react';
import { CouponsPanel } from './components/CouponsPanel';
import { CustomerBalancePanel } from './components/CustomerBalancePanel';

type PromotionsTab = 'coupons' | 'balances' | 'loyalty';

export function PromotionsPage() {
  const [activeTab, setActiveTab] = useState<PromotionsTab>('coupons');

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto text-left space-y-6">
      {/* Header Centralizado */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight flex items-center gap-2">
            <Ticket className="text-primary-600" /> Promoções e Retenção
          </h1>
          <p className="text-xs md:text-sm text-gray-500 dark:text-gray-400 mt-1">Gestão de cupons, saldos e fidelidade de clientes.</p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex flex-wrap items-center gap-1 bg-gray-100 dark:bg-gray-800/50 p-1 rounded-xl w-fit">
        {[
          { id: 'coupons', label: 'Cupons', icon: Ticket },
          { id: 'balances', label: 'Cashback e Carteira', icon: Wallet },
          { id: 'loyalty', label: 'Fidelidade', icon: Star },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as PromotionsTab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
              activeTab === tab.id
                ? 'bg-card text-primary shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <tab.icon size={14} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="card-premium p-4 md:p-6 overflow-hidden border-none shadow-premium bg-white/60 dark:bg-gray-900/60 backdrop-blur-md">
        {activeTab === 'coupons' && <CouponsPanel />}
        {activeTab === 'balances' && <CustomerBalancePanel mode="wallet-cashback" />}
        {activeTab === 'loyalty' && <CustomerBalancePanel mode="loyalty" />}
      </div>
    </div>
  );
}
