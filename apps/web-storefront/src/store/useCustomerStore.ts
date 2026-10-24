import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { CustomerDTO } from '@gestor/types';

function normalizeCustomer(customer: CustomerDTO | null): CustomerDTO | null {
  if (!customer) return null;

  return {
    ...customer,
    email: customer.email ?? null,
    totalOrders: Number(customer.totalOrders ?? 0),
    totalSpent: Number(customer.totalSpent ?? 0),
    loyaltyPoints: Number(customer.loyaltyPoints ?? 0),
    cashbackBalance: Number(customer.cashbackBalance ?? 0),
    createdAt: customer.createdAt ?? new Date(0).toISOString(),
    updatedAt: customer.updatedAt ?? new Date(0).toISOString(),
  };
}

interface CustomerState {
  customer: CustomerDTO | null;
  accessToken: string | null;
  refreshToken: string | null;
  tenantSlug: string | null;
  setCustomer: (
    customer: CustomerDTO | null,
    accessToken: string | null,
    refreshToken: string | null,
    tenantSlug: string,
  ) => void;
  setTenantSlug: (tenantSlug: string) => void;
  logout: () => void;
  isLoggedIn: boolean;
}

export const useCustomerStore = create<CustomerState>()(
  persist(
    (set) => ({
      customer: null,
      accessToken: null,
      refreshToken: null,
      tenantSlug: null,
      isLoggedIn: false,
      setCustomer: (customer, accessToken, refreshToken, tenantSlug) => set({
        customer: normalizeCustomer(customer),
        accessToken,
        refreshToken,
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
            refreshToken: null,
            isLoggedIn: false,
            tenantSlug,
          };
        }),
      logout: () => set({ 
        customer: null, 
        accessToken: null,
        refreshToken: null,
        tenantSlug: null,
        isLoggedIn: false 
      }),
    }),
    {
      name: 'customer-storage',
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.customer = normalizeCustomer(state.customer);
      },
    }
  )
);
