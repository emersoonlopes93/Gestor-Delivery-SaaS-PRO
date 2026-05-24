import { memo } from 'react';
import { Truck, Phone, UserMinus, UserPlus } from 'lucide-react';

interface OrderDriverSectionProps {
  driverId?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  driverStatus?: string | null;
  onAssignDriver: () => void;
}

export const OrderDriverSection = memo(function OrderDriverSection({ 
  driverId, 
  driverName, 
  driverPhone,
  driverStatus,
  onAssignDriver
}: OrderDriverSectionProps) {
  
  return (
    <section>
      <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-3">Logística / Entregador</h3>
      
      {driverId ? (
        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                <Truck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  {driverName}
                  {driverStatus === 'busy' && (
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Em rota" />
                  )}
                </p>
                {driverPhone && (
                  <div className="flex items-center gap-1.5 mt-0.5 text-xs text-slate-500">
                    <Phone className="w-3 h-3" />
                    <span>{driverPhone}</span>
                  </div>
                )}
              </div>
            </div>
            <button 
              onClick={onAssignDriver}
              className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-500 transition-colors"
              title="Trocar Entregador"
            >
              <UserMinus className="w-4 h-4" />
            </button>
          </div>
          
          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700/50 flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</span>
            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
              driverStatus === 'busy' 
                ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' 
                : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
            }`}>
              {driverStatus === 'busy' ? 'Em Entrega' : 'Disponível'}
            </span>
          </div>
        </div>
      ) : (
        <button 
          onClick={onAssignDriver}
          className="w-full p-4 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-primary-500 dark:hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/10 transition-all flex flex-col items-center justify-center gap-2 group"
        >
          <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/40 flex items-center justify-center transition-colors">
            <UserPlus className="w-5 h-5 text-slate-400 group-hover:text-primary-600" />
          </div>
          <span className="text-sm font-bold text-slate-500 group-hover:text-primary-600">Atribuir Entregador</span>
        </button>
      )}
    </section>
  );
});
