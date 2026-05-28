import React, { useState } from 'react';
import { 
  X, 
  ArrowLeftRight, 
  Search,
  Check
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';

interface TransferTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceTableId: string;
  sourceTableName: string;
  availableTables: Array<{ id: string, name: string, status: string }>;
}

export const TransferTableModal: React.FC<TransferTableModalProps> = ({ 
  isOpen, 
  onClose, 
  sourceTableId, 
  sourceTableName,
  availableTables 
}) => {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const filteredTables = availableTables.filter(t => 
    t.status === 'free' && 
    t.id !== sourceTableId &&
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleTransfer = async () => {
    if (!selectedTargetId) return;
    setIsSubmitting(true);
    try {
      await api.post('/pos/tables/transfer', {
        sourceTableId,
        targetTableId: selectedTargetId
      });
      queryClient.invalidateQueries({ queryKey: ['posSalon'] });
      onClose();
    } catch (err) {
      console.error('Transfer error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-card border border-border w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between bg-muted">
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/10 text-blue-500 rounded-2xl flex items-center justify-center border border-blue-500/20">
                 <ArrowLeftRight size={20} />
              </div>
              <div>
                 <h3 className="text-lg font-black text-foreground leading-tight uppercase tracking-tight">Transferir Mesa</h3>
                 <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Origem: {sourceTableName}</p>
              </div>
           </div>
           <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-2 hover:bg-muted rounded-xl transition-all">
              <X size={20} />
           </button>
        </div>

        {/* Search */}
        <div className="p-4">
           <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-blue-500 transition-colors" size={16} />
              <input 
                type="text" 
                placeholder="Buscar mesa de destino..."
                className="w-full bg-muted border border-border rounded-2xl pl-12 pr-4 py-3 text-sm text-foreground outline-none focus:border-blue-500 transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
           </div>
        </div>

        {/* Table List */}
        <div className="px-4 pb-4 max-h-[300px] overflow-y-auto scrollbar-hide">
           <div className="grid grid-cols-3 gap-2">
              {filteredTables.map(table => (
                 <button
                   key={table.id}
                   onClick={() => setSelectedTargetId(table.id)}
                   className={`
                     p-4 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 transition-all
                     ${selectedTargetId === table.id 
                       ? 'bg-blue-500/10 border-blue-500 text-blue-500 shadow-lg shadow-blue-500/10' 
                       : 'bg-muted border-border text-muted-foreground hover:border-border'}
                   `}
                 >
                    <span className="text-xs font-black uppercase">{table.name}</span>
                    {selectedTargetId === table.id && <Check size={12} strokeWidth={4} />}
                 </button>
              ))}
              {filteredTables.length === 0 && (
                <div className="col-span-3 py-10 text-center opacity-50">
                   <p className="text-xs font-bold uppercase">Nenhuma mesa livre encontrada</p>
                </div>
              )}
           </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-muted border-t border-border flex gap-3">
           <button 
             onClick={onClose}
             className="flex-1 px-6 py-4 rounded-2xl text-[11px] font-black uppercase text-muted-foreground hover:bg-card transition-colors border border-transparent hover:border-border"
           >
              Cancelar
           </button>
           <button 
             disabled={!selectedTargetId || isSubmitting}
             onClick={handleTransfer}
             className="flex-[2] bg-primary hover:bg-primary/90 text-white px-6 py-4 rounded-2xl text-[11px] font-black uppercase shadow-xl shadow-blue-900/20 transition-all active:scale-95 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-70 disabled:cursor-not-allowed"
           >
              {isSubmitting ? 'Transferindo...' : 'Confirmar Transferência'}
           </button>
        </div>

      </div>
    </div>
  );
};
