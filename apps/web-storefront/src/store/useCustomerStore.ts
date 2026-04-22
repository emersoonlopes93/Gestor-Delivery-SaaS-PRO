import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { CustomerDTO } from '@gestor/types';

interface CustomerState {
  customer: CustomerDTO | null;
  accessToken: string | null;
  setCustomer: (customer: CustomerDTO | null, accessToken: string | null) => void;
  logout: () => void;
  isLoggedIn: boolean;
}

export const useCustomerStore = create<CustomerState>()(
  persist(
    (set) => ({
      customer: null,
      accessToken: null,
      isLoggedIn: false,
      setCustomer: (customer, accessToken) => set({ 
        customer, 
        accessToken, 
        isLoggedIn: !!accessToken 
      }),
      logout: () => set({ 
        customer: null, 
        accessToken: null, 
        isLoggedIn: false 
      }),
    }),
    {
      name: 'customer-storage',
    }
  )
);
