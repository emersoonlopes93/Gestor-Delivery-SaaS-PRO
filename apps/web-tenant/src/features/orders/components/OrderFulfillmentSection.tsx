import { memo } from 'react';
import { MapPin, Navigation } from 'lucide-react';
import type { DeliveryAddressDTO } from '@gestor/types';

interface OrderFulfillmentSectionProps {
  fulfillmentType: string;
  deliveryAddress?: DeliveryAddressDTO | null;
  tableNumber?: string | null;
}

export const OrderFulfillmentSection = memo(function OrderFulfillmentSection({ 
  fulfillmentType, 
  deliveryAddress,
  tableNumber 
}: OrderFulfillmentSectionProps) {
  
  const handleOpenMap = () => {
    if (deliveryAddress) {
      const addr = `${deliveryAddress.street}, ${deliveryAddress.number}, ${deliveryAddress.city}`;
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`, '_blank');
    }
  };

  return (
    <section>
      <h3 className="text-[11px] font-black uppercase tracking-wider text-muted-foreground mb-3">
        {fulfillmentType === 'delivery' ? 'Entrega' : fulfillmentType === 'pickup' ? 'Retirada' : 'Mesa'}
      </h3>
      
      {fulfillmentType === 'delivery' && deliveryAddress ? (
        <div className="bg-background p-4 rounded-2xl border border-border flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-start gap-2">
              <p className="text-sm font-bold text-foreground leading-tight">
                {deliveryAddress.street}, {deliveryAddress.number}
                {deliveryAddress.complement && ` - ${deliveryAddress.complement}`}
              </p>
              <button 
                onClick={handleOpenMap}
                className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors shrink-0"
                title="Abrir no Mapa"
              >
                <Navigation className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {deliveryAddress.neighborhood} - {deliveryAddress.city}/{deliveryAddress.state}
            </p>
            {deliveryAddress.reference && (
              <p className="text-[11px] text-muted-foreground mt-1.5 italic bg-muted px-2 py-1 rounded-md inline-block">
                Ref: {deliveryAddress.reference}
              </p>
            )}
          </div>
        </div>
      ) : fulfillmentType === 'dine_in' && tableNumber ? (
        <div className="bg-background p-4 rounded-2xl border border-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
            <span className="text-lg font-black text-blue-600 dark:text-blue-400">#</span>
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Mesa {tableNumber}</p>
            <p className="text-xs text-muted-foreground">Consumo no local</p>
          </div>
        </div>
      ) : (
        <div className="bg-background p-4 rounded-2xl border border-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
            <span className="text-lg font-black text-amber-600 dark:text-amber-400">🏪</span>
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Retirada no Balcão</p>
            <p className="text-xs text-muted-foreground">O cliente virá buscar</p>
          </div>
        </div>
      )}
    </section>
  );
});
