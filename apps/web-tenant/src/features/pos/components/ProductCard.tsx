import React from 'react';
import { Package, Plus, Star } from 'lucide-react';

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
    <div
      className="group relative flex flex-col rounded-2xl border border-border/70 bg-card/80 overflow-hidden shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/5"
    >
      {/* Image Container */}
      <div className="aspect-[4/3] w-full bg-muted/30 relative overflow-hidden shrink-0">
        {product.image ? (
          <img 
            src={product.image} 
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-muted-foreground/60 bg-gradient-to-br from-card via-muted/20 to-muted/40">
            <Package size={36} strokeWidth={1.2} />
            <span className="text-[10px] font-semibold tracking-wide uppercase text-muted-foreground/60">Sem foto</span>
          </div>
        )}
        
        {/* Combo / Highlight Badge */}
        {isCombo ? (
          <div className="absolute top-2 left-2 flex items-center gap-1 rounded-md bg-amber-500/90 backdrop-blur-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-950 shadow-md">
            <Star size={10} className="fill-current" />
            Combo
          </div>
        ) : null}
      </div>

      {/* Content Info */}
      <div className="p-3 flex-1 flex flex-col justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-extrabold text-foreground text-xs sm:text-sm leading-tight line-clamp-1 group-hover:text-primary transition-colors">
            {product.name}
          </h3>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mt-0.5 truncate">
            {product.categoryName}
          </p>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-primary font-black text-sm sm:text-base tabular-nums">
            {formatCurrency(product.basePrice)}
          </span>
          <button
            type="button"
            onClick={() => onAdd(product)}
            aria-label={`Adicionar ${product.name} ao pedido`}
            className="h-8 w-8 rounded-xl bg-primary text-primary-foreground font-black flex items-center justify-center shadow-md shadow-primary/20 transition-all hover:bg-primary/90 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Plus size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
};
