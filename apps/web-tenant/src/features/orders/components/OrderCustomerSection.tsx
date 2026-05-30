import { memo } from 'react';
import { Phone, MessageSquare, Copy } from 'lucide-react';
import toast from 'react-hot-toast';

interface OrderCustomerSectionProps {
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  notes?: string | null;
}

export const OrderCustomerSection = memo(function OrderCustomerSection({ 
  customerName, 
  customerPhone, 
  customerEmail,
  notes 
}: OrderCustomerSectionProps) {
  
  const handleCopyPhone = () => {
    if (customerPhone) {
      navigator.clipboard.writeText(customerPhone);
      toast.success('Telefone copiado!');
    }
  };

  const handleWhatsApp = () => {
    if (customerPhone) {
      const cleanPhone = customerPhone.replace(/\D/g, '');
      window.open(`https://wa.me/55${cleanPhone}`, '_blank');
    }
  };

  return (
    <section>
      <h3 className="text-[11px] font-black uppercase tracking-wider text-muted-foreground mb-3">Cliente</h3>
      <div className="bg-background p-4 rounded-2xl border border-border">
        <div className="flex justify-between items-start">
          <div>
            <p className="font-bold text-foreground">{customerName}</p>
            {customerEmail && (
              <p className="text-xs text-muted-foreground mt-0.5">{customerEmail}</p>
            )}
          </div>
          {customerPhone && (
            <div className="flex gap-1">
              <button 
                onClick={handleCopyPhone}
                className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                title="Copiar Telefone"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={handleWhatsApp}
                className="p-1.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-lg text-emerald-600 dark:text-emerald-400 transition-colors"
                title="Abrir WhatsApp"
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {customerPhone && (
          <div className="flex items-center gap-2 mt-2">
            <Phone className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{customerPhone}</span>
          </div>
        )}

        {notes && (
          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40 rounded-xl">
            <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-1">Observação do Cliente</p>
            <p className="text-xs text-amber-900 dark:text-amber-200 font-medium italic">"{notes}"</p>
          </div>
        )}
      </div>
    </section>
  );
});
