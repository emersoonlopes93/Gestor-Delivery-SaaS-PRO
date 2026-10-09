import { memo } from 'react';
import { X, User } from 'lucide-react';
import type { DriverDTO } from '@gestor/types';

interface DriverSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (driverId: string) => void;
  drivers: DriverDTO[];
  isSubmitting: boolean;
}

export const DriverSelectionModal = memo(function DriverSelectionModal({ 
  isOpen, 
  onClose, 
  onSelect, 
  drivers, 
  isSubmitting 
}: DriverSelectionModalProps) {
  
  if (!isOpen) return null;

  const availableDrivers = drivers.filter((d) => d.isActive && d.status !== 'offline');

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 safe-modal bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card dark:bg-muted900 rounded-3xl shadow-2xl w-full max-w-sm max-h-[calc(100dvh-var(--safe-area-top)-var(--safe-area-bottom)-2rem)] overflow-hidden animate-in zoom-in-95 duration-200 border border-border200 dark:border-border800">
        <header className="px-6 py-5 border-b border-border100 dark:border-border800 flex items-center justify-between bg-muted50/50 dark:bg-muted800/50">
          <div>
            <h2 className="text-lg font-black text-muted-foreground900 dark:text-white tracking-tight">Atribuir Entregador</h2>
            <p className="text-xs text-muted-foreground500 font-medium mt-0.5">Selecione quem fará a entrega</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar atribuição de entregador"
            className="rounded-xl p-2 text-slate-700 transition-colors hover:bg-slate-200 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-background dark:text-slate-100 dark:hover:bg-slate-700 dark:hover:text-white dark:focus:ring-offset-slate-900"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>

        <div className="p-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {availableDrivers.length === 0 ? (
            <div className="py-10 text-center">
              <div className="w-12 h-12 bg-muted100 dark:bg-muted800 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <User className="w-6 h-6 text-muted-foreground400" />
              </div>
              <p className="text-sm font-bold text-muted-foreground900 dark:text-white">Nenhum entregador disponível</p>
              <p className="text-xs text-muted-foreground500 mt-1 px-6">Todos os entregadores estão offline ou ocupados no momento.</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {availableDrivers.map((d) => (
                <button
                  key={d.id}
                  disabled={isSubmitting}
                  onClick={() => onSelect(d.id)}
                  className="flex items-center gap-4 p-4 rounded-2xl hover:bg-primary-50 dark:hover:bg-primary-900/20 border border-transparent hover:border-primary-100 dark:hover:border-primary-800 transition-all text-left active:scale-[0.98] group"
                >
                  <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/40 text-primary-600 rounded-xl flex items-center justify-center font-black group-hover:bg-primary-600 group-hover:text-white transition-colors">
                    {d.name.substring(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-muted-foreground900 dark:text-white truncate">{d.name}</p>
                    <p className="text-[10px] text-muted-foreground500 font-bold uppercase tracking-widest mt-0.5">{d.vehicleType}</p>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                </button>
              ))}
            </div>
          )}
        </div>

        <footer className="p-4 bg-muted50 dark:bg-muted800/30 border-t border-border100 dark:border-border800">
          <button
            onClick={onClose}
            className="w-full py-3 text-sm font-black text-muted-foreground500 hover:text-muted-foreground800 dark:hover:text-muted-foreground200 transition-colors uppercase tracking-widest"
          >
            Cancelar
          </button>
        </footer>
      </div>
    </div>
  );
});
