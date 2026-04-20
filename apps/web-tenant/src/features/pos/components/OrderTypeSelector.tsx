import React from 'react';
import { ShoppingBag, Utensils, Bike } from 'lucide-react';
import { PosFulfillmentType } from '@gestor/types';

interface OrderTypeSelectorProps {
  currentType: PosFulfillmentType;
  onTypeChange: (type: PosFulfillmentType) => void;
}

const ORDER_TYPES = [
  {
    id: PosFulfillmentType.DINE_IN,
    label: 'Balcão',
    icon: Utensils,
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
    <div className="grid grid-cols-3 gap-2">
      {ORDER_TYPES.map((type) => {
        const Icon = type.icon;
        const isActive = currentType === type.id;
        
        return (
          <button
            key={type.id}
            onClick={() => onTypeChange(type.id)}
            className={`
              flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all duration-200
              ${isActive 
                ? `bg-${type.color}-500/10 border-${type.color}-500 text-${type.color}-400 shadow-lg shadow-${type.color}-500/10` 
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:bg-gray-750'}
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
