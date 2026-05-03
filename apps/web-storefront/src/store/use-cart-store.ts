import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { 
  CartLineItem, 
  StorefrontProductPayload, 
  StorefrontComboPayload,
  CartBundleItemSnapshot,
  CartSelectedComplement,
  CartSelectedComboItem,
  CartSnapshot 
} from '@gestor/types';

interface CartState {
  tenantId: string | null;
  tableId: string | null;
  items: CartLineItem[];
  subtotal: number;
  
  // Actions
  setTenantId: (id: string) => void;
  setTableId: (id: string | null) => void;
  addItem: (product: StorefrontProductPayload, quantity: number, options: CartSelectedComplement[], notes?: string, sourceUpsellId?: string) => void;
  addCombo: (combo: StorefrontComboPayload, quantity: number, selectedItems: CartSelectedComboItem[], bundleItems: CartBundleItemSnapshot[], notes?: string) => void;
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

      addItem: (product, quantity, options, notes, sourceUpsellId) => {
        if (!product.isAvailable) return;
        const extrasPrice = options.reduce((sum, opt) => sum + opt.price, 0);
        const lineSubtotal = (product.basePrice + extrasPrice) * quantity;
        
        const extrasDescription = options.map(o => o.name).join(', ');

        const snapshot: CartSnapshot = {
          productName: product.name,
          productImage: product.image,
          basePrice: product.basePrice,
          lineSubtotal,
          extrasDescription,
        };

        const newItem: CartLineItem = {
          cartLineId: crypto.randomUUID(),
          productId: product.id,
          quantity,
          notes,
          selectedOptions: options,
          sourceUpsellId,
          snapshot,
        };

        const newItems = [...get().items, newItem];
        set({ 
          items: newItems,
          subtotal: newItems.reduce((sum, item) => sum + item.snapshot.lineSubtotal, 0)
        });
      },

      addCombo: (combo, quantity, selectedItems, bundleItems, notes) => {
        if (!combo.isAvailable) return;
        const extrasPrice = selectedItems.reduce((sum, item) => sum + item.price, 0);
        const lineSubtotal = (combo.basePrice + extrasPrice) * quantity;
        
        const extrasDescription =
          bundleItems.length > 0
            ? bundleItems.map(i => `${i.productName} x${i.qty}`).join(', ')
            : selectedItems.map(i => i.productName).join(', ');

        const snapshot: CartSnapshot = {
          productName: combo.name,
          productImage: combo.image,
          basePrice: combo.basePrice,
          lineSubtotal,
          extrasDescription,
        };

        const newItem: CartLineItem = {
          cartLineId: crypto.randomUUID(),
          comboId: combo.id,
          quantity,
          notes,
          selectedComboItems: selectedItems,
          bundleItems,
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
            const unitPrice = item.snapshot.basePrice + 
              (item.selectedOptions?.reduce((s, o) => s + o.price, 0) || 0) +
              (item.selectedComboItems?.reduce((s, i) => s + i.price, 0) || 0);

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
