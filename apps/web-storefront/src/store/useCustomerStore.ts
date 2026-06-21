import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { CustomerDTO } from '@gestor/types';

interface CustomerState {
  customer: CustomerDTO | null;
  accessToken: string | null;
  tenantSlug: string | null;
  setCustomer: (customer: CustomerDTO | null, accessToken: string | null, tenantSlug: string) => void;
  setTenantSlug: (tenantSlug: string) => void;
  logout: () => void;
  isLoggedIn: boolean;
}

export const useCustomerStore = create<CustomerState>()(
  persist(
    (set) => ({
      customer: null,
      accessToken: null,
      tenantSlug: null,
      isLoggedIn: false,
      setCustomer: (customer, accessToken, tenantSlug) => set({ 
        customer, 
        accessToken, 
        tenantSlug,
        isLoggedIn: !!accessToken 
      }),
      setTenantSlug: (tenantSlug) =>
        set((state) => {
          if (!state.tenantSlug || state.tenantSlug === tenantSlug) {
            return { tenantSlug };
          }

          return {
            customer: null,
            accessToken: null,
            isLoggedIn: false,
            tenantSlug,
          };
        }),
      logout: () => set({ 
        customer: null, 
        accessToken: null, 
        tenantSlug: null,
        isLoggedIn: false 
      }),
    }),
    {
      name: 'customer-storage',
    }
  )
);
