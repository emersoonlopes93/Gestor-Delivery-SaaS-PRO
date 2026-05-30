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
      <h3 className="text-[11px] font-black uppercase tracking-wider text-muted-foreground mb-3">Logística / Entregador</h3>
      
      {driverId ? (
        <div className="bg-background p-4 rounded-2xl border border-border">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                <Truck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground flex items-center gap-2">
                  {driverName}
                  {driverStatus === 'busy' && (
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Em rota" />
                  )}
                </p>
                {driverPhone && (
                  <div className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground">
                    <Phone className="w-3 h-3" />
                    <span>{driverPhone}</span>
                  </div>
                )}
              </div>
            </div>
            <button 
              onClick={onAssignDriver}
              className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
              title="Trocar Entregador"
            >
              <UserMinus className="w-4 h-4" />
            </button>
          </div>
          
          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Status</span>
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
          className="w-full p-4 rounded-2xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 transition-all flex flex-col items-center justify-center gap-2 group"
        >
          <div className="w-10 h-10 rounded-full bg-muted group-hover:bg-primary/10 flex items-center justify-center transition-colors">
            <UserPlus className="w-5 h-5 text-muted-foreground group-hover:text-primary" />
          </div>
          <span className="text-sm font-bold text-muted-foreground group-hover:text-primary">Atribuir Entregador</span>
        </button>
      )}
    </section>
  );
});
