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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800">
        <header className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">Atribuir Entregador</h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Selecione quem fará a entrega</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </header>

        <div className="p-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
          {availableDrivers.length === 0 ? (
            <div className="py-10 text-center">
              <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <User className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-sm font-bold text-slate-900 dark:text-white">Nenhum entregador disponível</p>
              <p className="text-xs text-slate-500 mt-1 px-6">Todos os entregadores estão offline ou ocupados no momento.</p>
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
                    <p className="text-sm font-black text-slate-900 dark:text-white truncate">{d.name}</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">{d.vehicleType}</p>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                </button>
              ))}
            </div>
          )}
        </div>

        <footer className="p-4 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onClose}
            className="w-full py-3 text-sm font-black text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors uppercase tracking-widest"
          >
            Cancelar
          </button>
        </footer>
      </div>
    </div>
  );
});
