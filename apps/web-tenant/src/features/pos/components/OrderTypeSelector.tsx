import React from 'react';
import { ShoppingBag, Truck, Users, Store } from 'lucide-react';
import { PosFulfillmentType } from '@gestor/types';

interface OrderTypeSelectorProps {
  currentType: PosFulfillmentType;
  onTypeChange: (type: PosFulfillmentType) => void;
}

const ORDER_TYPES = [
  {
    id: PosFulfillmentType.DINE_IN,
    label: 'Balcão',
    icon: Store,
  },
  {
    id: PosFulfillmentType.TABLE,
    label: 'Mesa',
    icon: Users,
  },
  {
    id: PosFulfillmentType.PICKUP,
    label: 'Retirada',
    icon: ShoppingBag,
  },
  {
    id: PosFulfillmentType.DELIVERY,
    label: 'Delivery',
    icon: Truck,
  },
];

export const OrderTypeSelector: React.FC<OrderTypeSelectorProps> = ({
  currentType,
  onTypeChange,
}) => {
  return (
    <div className="grid grid-cols-4 gap-2 w-full sm:w-auto">
      {ORDER_TYPES.map((type) => {
        const Icon = type.icon;
        const isActive = currentType === type.id;

        return (
          <button
            key={type.id}
            type="button"
            onClick={() => onTypeChange(type.id)}
            className={`
              flex min-w-[76px] sm:min-w-[88px] flex-col items-center justify-center rounded-xl border px-3 py-2.5 transition-all duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary
              ${isActive
                ? 'border-primary bg-primary/10 text-primary shadow-lg shadow-primary/10 font-bold'
                : 'border-border/60 bg-card/60 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground'}
            `}
          >
            <Icon size={18} className="shrink-0" />
            <span className="mt-1 text-[11px] font-bold tracking-tight">{type.label}</span>
          </button>
        );
      })}
    </div>
  );
};
