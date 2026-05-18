import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { 
  CartLineItem, 
  StorefrontProductPayload, 
  CartBundleItemSnapshot,
  CartSelectedOptionGroup,
  CartSelectedComboSlot,
  CartSnapshot,
  CartSelectedComplement
} from '@gestor/types';

interface CartState {
  tenantId: string | null;
  tableId: string | null;
  items: CartLineItem[];
  subtotal: number;
  
  // Actions
  setTenantId: (id: string) => void;
  setTableId: (id: string | null) => void;
  
  // V2 Compatible Actions
  addItem: (params: {
    product: StorefrontProductPayload;
    quantity: number;
    notes?: string;
    selectedOptions?: CartSelectedComplement[];
    selections?: CartSelectedOptionGroup[];
    slots?: CartSelectedComboSlot[];
    bundleItems?: CartBundleItemSnapshot[];
    sourceUpsellId?: string;
    computedUnitPrice: number;
    compositionLabel: string;
  }) => void;

  removeItem: (cartLineId: string) => void;
  updateQuantity: (cartLineId: string, quantity: number) => void;
  clearCart: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      tenantId: null,
      tableId: null,
      items: [],
      subtotal: 0,

      setTenantId: (id) => {
        if (get().tenantId !== id) {
          set({ tenantId: id, tableId: null, items: [], subtotal: 0 });
        }
      },

      setTableId: (id) => set({ tableId: id }),

      addItem: ({ 
        product, 
        quantity, 
        notes, 
        selectedOptions, 
        selections, 
        slots, 
        bundleItems, 
        sourceUpsellId,
        computedUnitPrice,
        compositionLabel 
      }) => {
        if (!product.isAvailable) return;
        
        const lineSubtotal = computedUnitPrice * quantity;

        const snapshot: CartSnapshot = {
          productName: product.name,
          productImage: product.image,
          basePrice: product.basePrice,
          lineSubtotal,
          extrasDescription: compositionLabel,
        };

        const newItem: CartLineItem = {
          cartLineId: crypto.randomUUID(),
          productId: product.type === 'combo' ? undefined : product.id,
          comboId: product.type === 'combo' ? product.id : undefined,
          quantity,
          notes,
          selectedOptions,
          selections,
          slots,
          bundleItems,
          sourceUpsellId,
          snapshot,
        };

        const newItems = [...get().items, newItem];
        set({ 
          items: newItems,
          subtotal: newItems.reduce((sum, item) => sum + item.snapshot.lineSubtotal, 0)
        });
      },

      removeItem: (cartLineId) => {
        const newItems = get().items.filter(item => item.cartLineId !== cartLineId);
        set({ 
          items: newItems,
          subtotal: newItems.reduce((sum, item) => sum + item.snapshot.lineSubtotal, 0)
        });
      },

      updateQuantity: (cartLineId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(cartLineId);
          return;
        }

        const newItems = get().items.map(item => {
          if (item.cartLineId === cartLineId) {
            const legacyExtras = (item.selectedOptions?.reduce((s, o) => s + o.price, 0) || 0) +
              (item.selectedComboItems?.reduce((s, i) => s + i.price, 0) || 0);
            
            const v2Extras = (item.selections?.reduce((s, g) => s + g.items.reduce((ss, i) => {
              if (i.priceImpactType === 'fixed') return ss + (i.priceImpactValue * (i.qty || 1));
              if (i.priceImpactType === 'percentage') return ss + (item.snapshot.basePrice * (i.priceImpactValue / 100) * (i.qty || 1));
              return ss;
            }, 0), 0) || 0) + 
            (item.slots?.reduce((s, slot) => s + slot.items.reduce((ss, i) => ss + (i.additionalPrice * (i.qty || 1)), 0), 0) || 0);

            const unitPrice = item.snapshot.basePrice + legacyExtras + v2Extras;

            const lineSubtotal = unitPrice * quantity;
            return {
              ...item,
              quantity,
              snapshot: { ...item.snapshot, lineSubtotal }
            };
          }
          return item;
        });

        set({ 
          items: newItems,
          subtotal: newItems.reduce((sum, item) => sum + item.snapshot.lineSubtotal, 0)
        });
      },

      clearCart: () => set({ items: [], subtotal: 0 }),
    }),
    {
      name: 'gestor_cart_temp',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ items: state.items, subtotal: state.subtotal, tableId: state.tableId }),
    }
  )
);


// Helper to rehydrate/switch storage if needed or just use tenantId in separate logic
// In a real multi-tenant app, you might want to instantiate the store per-route-context 
// or use a different persistence strategy. 
// For now, we use a single store but we clear it if tenantId changes.
