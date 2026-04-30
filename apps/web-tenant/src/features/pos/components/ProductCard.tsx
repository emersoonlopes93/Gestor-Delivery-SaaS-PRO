import React from 'react';
import { Package, Plus } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  basePrice: number;
  image: string | null;
  categoryName: string;
  categoryId: string;
  type: 'simple' | 'configurable' | 'combo';
}

interface ProductCardProps {
  product: Product;
  onAdd: (product: Product) => void;
}

const formatCurrency = (value: number) => {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

export const ProductCard: React.FC<ProductCardProps> = ({ product, onAdd }) => {
  const isCombo = product.type === 'combo';
  
  return (
    <button
      onClick={() => onAdd(product)}
      className="group relative flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden hover:border-emerald-500/50 hover:shadow-2xl hover:shadow-emerald-500/10 transition-all duration-300"
    >
      {/* Image Area */}
      <div className="aspect-[4/3] w-full bg-white dark:bg-gray-900 relative overflow-hidden">
        {product.image ? (
          <img 
            src={product.image} 
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-700 dark:text-gray-300 group-hover:text-gray-600 dark:text-gray-400 transition-colors">
            <Package size={48} strokeWidth={1} />
          </div>
        )}
        
        {/* Combo Badge */}
        {isCombo && (
          <div className="absolute top-2 right-2 px-2 py-1 bg-indigo-600 text-[10px] font-black uppercase tracking-widest text-gray-900 dark:text-white rounded-lg shadow-lg">
            Combo
          </div>
        )}

        {/* Floating Add Button (Mobile feel) */}
        <div className="absolute bottom-2 right-2 w-8 h-8 bg-emerald-500 text-gray-900 dark:text-white rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform scale-75 group-hover:scale-100">
          <Plus size={18} strokeWidth={3} />
        </div>
      </div>

      {/* Info Area */}
      <div className="p-2 text-left flex-1 flex flex-col justify-between">
        <div>
          <h3 className="font-bold text-gray-900 dark:text-gray-100 text-[12px] leading-tight line-clamp-2 min-h-[2rem] group-hover:text-emerald-400 transition-colors">
            {product.name}
          </h3>
          <p className="text-[9px] text-gray-600 dark:text-gray-400 uppercase tracking-wider mt-0.5">{product.categoryName}</p>
        </div>
        
        <div className="mt-1 text-emerald-400 font-black text-sm">
          {formatCurrency(product.basePrice)}
        </div>
      </div>
    </button>
  );
};
