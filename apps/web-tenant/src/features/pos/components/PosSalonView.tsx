import React from 'react';
import { 
  Users, 
  Clock, 
  DollarSign, 
  ChevronRight,
  LayoutGrid,
  ClipboardList
} from 'lucide-react';

export type TableStatus = 'free' | 'occupied' | 'waiting_bill' | 'reserved';

export interface SalonTable {
  id: string;
  name: string;
  capacity: number;
  status: TableStatus;
  activeOrderId?: string;
  order?: {
    id: string;
    total: number;
    customerName: string;
    createdAt: string;
  };
}

interface PosSalonViewProps {
  tables: SalonTable[];
  onSelectTable: (table: SalonTable) => void;
  isLoading: boolean;
}

const formatCurrency = (value: number) => {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const getRelativeTime = (dateStr: string) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
};

export const PosSalonView: React.FC<PosSalonViewProps> = ({ tables, onSelectTable, isLoading }) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 p-6">
        {[1,2,3,4,5,6,7,8].map(i => (
          <div key={i} className="aspect-square bg-gray-900 animate-pulse rounded-3xl border border-gray-800" />
        ))}
      </div>
    );
  }

  const stats = {
    total: tables.length,
    occupied: tables.filter(t => t.status === 'occupied' || t.status === 'waiting_bill').length,
    free: tables.filter(t => t.status === 'free').length,
  };

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Salon Stats */}
      <div className="p-6 bg-gray-900 border-b border-gray-800 flex items-center gap-8 shadow-xl">
         <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-500/10 text-emerald-500 rounded-2xl flex items-center justify-center border border-emerald-500/20">
               <LayoutGrid size={24} />
            </div>
            <div>
               <h2 className="text-xl font-black text-white tracking-tight">Visão de Salão</h2>
               <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">Controle operacional em tempo real</p>
            </div>
         </div>

         <div className="flex gap-4 ml-auto">
            <div className="bg-gray-800/50 border border-gray-700 px-4 py-2 rounded-xl text-center min-w-[80px]">
               <p className="text-[9px] font-black text-gray-500 uppercase">Livres</p>
               <p className="text-xl font-black text-white">{stats.free}</p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-xl text-center min-w-[80px]">
               <p className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter">Ocupadas</p>
               <p className="text-xl font-black text-emerald-400">{stats.occupied}</p>
            </div>
            <div className="bg-gray-800/50 border border-gray-700 px-4 py-2 rounded-xl text-center min-w-[80px]">
               <p className="text-[9px] font-black text-gray-500 uppercase">Total</p>
               <p className="text-xl font-black text-white">{stats.total}</p>
            </div>
         </div>
      </div>

      {/* Grid Mesas */}
      <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4">
          {tables.map((table) => {
            const isOccupied = table.status === 'occupied' || table.status === 'waiting_bill';
            const isWaiting = table.status === 'waiting_bill';
            
            return (
              <button
                key={table.id}
                onClick={() => onSelectTable(table)}
                className={`
                  relative group flex flex-col items-center justify-center p-4 rounded-[2rem] border-2 transition-all duration-300
                  ${isOccupied 
                    ? isWaiting
                      ? 'bg-amber-500/10 border-amber-500 text-amber-500 shadow-lg shadow-amber-500/10' 
                      : 'bg-emerald-500/10 border-emerald-500 text-emerald-500 shadow-lg shadow-emerald-500/10'
                    : 'bg-gray-900 border-gray-800 text-gray-600 hover:border-gray-700 hover:bg-gray-800'}
                `}
              >
                {/* Badge Status */}
                <span className={`absolute top-4 right-4 w-3 h-3 rounded-full border-2 border-gray-900 animate-pulse ${isOccupied ? (isWaiting ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-gray-700'}`} />

                <div className="mb-2 transition-transform group-hover:scale-110">
                   <Users size={32} strokeWidth={isOccupied ? 2.5 : 1.5} />
                </div>

                <p className={`text-sm font-black uppercase tracking-widest ${isOccupied ? 'text-white' : 'text-gray-500'}`}>
                   {table.name}
                </p>

                {isOccupied && table.order ? (
                  <div className="mt-3 text-center animate-in fade-in zoom-in-95 duration-300">
                    <p className={`text-[10px] font-bold truncate max-w-[100px] mb-1 ${isWaiting ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {table.order.customerName || 'Cliente'}
                    </p>
                    <div className="flex flex-col items-center gap-1">
                       <span className="bg-black/20 px-2 py-0.5 rounded text-[11px] font-black">{formatCurrency(table.order.total)}</span>
                       <div className="flex items-center gap-1 text-[9px] opacity-70">
                          <Clock size={8} />
                          {getRelativeTime(table.order.createdAt)}
                       </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-[9px] mt-2 font-bold opacity-30 uppercase tracking-tighter">Mesa Livre</p>
                )}

                {/* Hover Action */}
                <div className="absolute inset-0 bg-emerald-500 rounded-[2rem] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity translate-y-4 group-hover:translate-y-0 duration-300 pointer-events-none">
                   <div className="flex flex-col items-center text-white">
                      <ChevronRight size={32} />
                      <span className="text-[10px] font-black uppercase">Atender</span>
                   </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer Legend */}
      <div className="p-4 bg-gray-900 border-t border-gray-800 flex justify-center gap-6 text-[9px] font-black uppercase tracking-widest text-gray-500">
         <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-gray-700" /> Livre
         </div>
         <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50" /> Ocupada / Atendimento
         </div>
         <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-lg shadow-amber-500/50" /> Aguardando Conta
         </div>
      </div>
    </div>
  );
};
