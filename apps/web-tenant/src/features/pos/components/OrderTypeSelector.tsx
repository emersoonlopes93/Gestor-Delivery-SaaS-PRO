import React from 'react';
import { ShoppingBag, Bike, Users, Store } from 'lucide-react';
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
    color: 'emerald',
  },
  {
    id: PosFulfillmentType.TABLE,
    label: 'Mesa',
    icon: Users,
    color: 'emerald',
  },
  {
    id: PosFulfillmentType.PICKUP,
    label: 'Retirada',
    icon: ShoppingBag,
    color: 'indigo',
  },
  {
    id: PosFulfillmentType.DELIVERY,
    label: 'Delivery',
    icon: Bike,
    color: 'amber',
  },
];

export const OrderTypeSelector: React.FC<OrderTypeSelectorProps> = ({
  currentType,
  onTypeChange,
}) => {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {ORDER_TYPES.map((type) => {
        const Icon = type.icon;
        const isActive = currentType === type.id;
        const colors = {
          emerald: 'bg-emerald-500/10 border-emerald-500 text-emerald-400 shadow-emerald-500/10',
          indigo: 'bg-indigo-500/10 border-indigo-500 text-indigo-400 shadow-indigo-500/10',
          amber: 'bg-amber-500/10 border-amber-500 text-amber-400 shadow-amber-500/10',
        };

        return (
          <button
            key={type.id}
            onClick={() => onTypeChange(type.id)}
            className={`
              flex flex-col items-center justify-center p-1.5 rounded-xl border-2 transition-all duration-200
              ${isActive 
                ? `${colors[type.color as keyof typeof colors]} shadow-lg` 
                : 'bg-card border-border text-muted-foreground hover:border-primary hover:bg-muted'}
            `}
          >
            <Icon size={20} className={isActive ? 'animate-bounce' : ''} />
            <span className="text-xs font-bold mt-1 uppercase tracking-tight">{type.label}</span>
          </button>
        );
      })}
    </div>
  );
};
