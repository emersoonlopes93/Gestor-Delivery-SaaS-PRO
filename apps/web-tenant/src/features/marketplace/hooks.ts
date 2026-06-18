import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';

export type MarketplaceProvider = 'ifood';
export type MarketplaceConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'PENDING' | 'ERROR';
export type MarketplaceEventStatus = 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED';

export type MarketplaceConnectionDTO = {
  id: string;
  tenantId: string;
  provider: MarketplaceProvider;
  status: MarketplaceConnectionStatus;
  externalMerchantId: string | null;
  externalStoreId: string | null;
  displayName: string | null;
  authType: string | null;
  settingsJson: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type MarketplaceEventInboxDTO = {
  id: string;
  tenantId: string;
  connectionId: string | null;
  provider: MarketplaceProvider;
  eventId: string | null;
  externalOrderId: string | null;
  externalStoreId: string | null;
  status: MarketplaceEventStatus;
  attempts: number;
  lastError: string | null;
  receivedAt: string;
  processedAt: string | null;
};

export type MarketplaceOrderDTO = {
  id: string;
  tenantId: string;
  connectionId: string | null;
  provider: MarketplaceProvider;
  externalOrderId: string;
  externalDisplayId: string | null;
  internalOrderId: string | null;
  statusExternal: string | null;
  statusInternal: string | null;
  importedAt: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MarketplaceStatusDTO = MarketplaceConnectionDTO | null;

export type ConnectMarketplaceManualInput = {
  externalMerchantId?: string;
  externalStoreId?: string;
  displayName?: string;
  authType?: string;
  settingsJson?: Record<string, unknown>;
};

export type BillingPreviewDTO = {
  includedChannels?: string[];
  excludedOrdersCount?: number;
  ordersCount?: number;
  billableAmount?: string | number;
  grossOrdersAmount?: string | number;
  serviceFeeAmount?: string | number;
  deliveryFeeAmount?: string | number;
  rating?: {
    currentMonthlyPrice?: string | number;
    revenueUntilNextTier?: string | number | null;
  } | null;
};

export function useMarketplaceConnections() {
  return useQuery({
    queryKey: ['marketplace-connections'],
    queryFn: async () => {
      const res = await api.get<MarketplaceConnectionDTO[]>('/marketplaces/connections');
      return res.data ?? [];
    },
  });
}

export function useMarketplaceStatus(provider: MarketplaceProvider = 'ifood') {
  return useQuery({
    queryKey: ['marketplace-status', provider],
    queryFn: async () => {
      const res = await api.get<MarketplaceStatusDTO>(`/marketplaces/${provider}/status`);
      return res.data ?? null;
    },
  });
}

export function useConnectMarketplaceManual(provider: MarketplaceProvider = 'ifood') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ConnectMarketplaceManualInput) => {
      const res = await api.post<MarketplaceConnectionDTO>(`/marketplaces/${provider}/connect/manual`, input);
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['marketplace-status', provider] });
      await queryClient.invalidateQueries({ queryKey: ['marketplace-connections'] });
      await queryClient.invalidateQueries({ queryKey: ['marketplace-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['marketplace-events'] });
    },
  });
}

export function useDisconnectMarketplace(provider: MarketplaceProvider = 'ifood') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<MarketplaceConnectionDTO>(`/marketplaces/${provider}/disconnect`);
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['marketplace-status', provider] });
      await queryClient.invalidateQueries({ queryKey: ['marketplace-connections'] });
    },
  });
}

export function useMarketplaceOrders() {
  return useQuery({
    queryKey: ['marketplace-orders'],
    queryFn: async () => {
      const res = await api.get<MarketplaceOrderDTO[]>('/marketplaces/orders');
      return res.data ?? [];
    },
  });
}

export function useMarketplaceEvents() {
  return useQuery({
    queryKey: ['marketplace-events'],
    queryFn: async () => {
      const res = await api.get<MarketplaceEventInboxDTO[]>('/marketplaces/events');
      return res.data ?? [];
    },
  });
}

export function useReprocessMarketplaceEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (eventInboxId: string) => {
      const res = await api.post(`/marketplaces/events/${eventInboxId}/reprocess`);
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['marketplace-events'] });
      await queryClient.invalidateQueries({ queryKey: ['marketplace-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useReprocessMarketplaceOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (marketplaceOrderId: string) => {
      const res = await api.post(`/marketplaces/orders/${marketplaceOrderId}/reprocess`);
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['marketplace-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useBillingPreview() {
  return useQuery({
    queryKey: ['marketplace-billing-preview'],
    queryFn: async () => {
      const res = await api.get<{ usagePreview?: BillingPreviewDTO }>('/billing/me');
      return res.data?.usagePreview ?? null;
    },
  });
}
