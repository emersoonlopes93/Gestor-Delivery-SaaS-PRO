import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Customer {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
}

interface CustomerState {
  customer: Customer | null;
  accessToken: string | null;
  setCustomer: (customer: Customer | null, accessToken: string | null) => void;
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
