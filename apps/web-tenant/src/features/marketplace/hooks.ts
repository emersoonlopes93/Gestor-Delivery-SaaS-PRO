import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api-client';

export type MarketplaceProvider = 'ifood' | '99food';
export type MarketplaceConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'TOKEN_EXPIRED' | 'ERROR' | 'PAUSED';
export type MarketplaceEventStatus = 'RECEIVED' | 'QUEUED' | 'PROCESSING' | 'PROCESSED' | 'FAILED' | 'IGNORED';

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
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
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

export type MarketplaceCatalogMappingDTO = {
  id: string;
  connectionId: string;
  provider: string;
  externalItemId: string;
  externalItemName: string | null;
  externalReferenceId: string | null;
  productId: string;
  status: 'ACTIVE' | 'DISABLED';
  connection: Pick<MarketplaceConnectionDTO, 'provider' | 'externalStoreId' | 'displayName'>;
  product: { id: string; name: string; sku: string | null };
};

export type UpsertMarketplaceCatalogMappingInput = {
  connectionId: string;
  externalItemId: string;
  externalItemName?: string;
  externalReferenceId?: string;
  productId: string;
  status?: 'ACTIVE' | 'DISABLED';
};

export type MarketplaceCatalogMappingCandidateDTO = {
  connectionId: string;
  provider: string;
  externalItemId: string;
  externalItemName: string | null;
  connection: { displayName: string | null; externalStoreId: string | null };
};

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

export function useMarketplaceStatus(provider: MarketplaceProvider = 'ifood', enabled = true) {
  return useQuery({
    queryKey: ['marketplace-status', provider],
    queryFn: async () => {
      const res = await api.get<MarketplaceStatusDTO>(`/marketplaces/${provider}/status`);
      return res.data ?? null;
    },
    enabled,
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

export function useDisconnectMarketplace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (connectionId: string) => {
      const res = await api.post<MarketplaceConnectionDTO>(`/marketplaces/connections/${connectionId}/disconnect`);
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['marketplace-status'] });
      await queryClient.invalidateQueries({ queryKey: ['marketplace-connections'] });
    },
  });
}

export function useRemoveMarketplaceConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (connectionId: string) => {
      const res = await api.delete<{ removed: true }>(`/marketplaces/connections/${connectionId}`);
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['marketplace-status'] });
      await queryClient.invalidateQueries({ queryKey: ['marketplace-connections'] });
    },
  });
}

export function useReconnectMarketplace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (connectionId: string) => {
      const res = await api.post<MarketplaceConnectionDTO>(`/marketplaces/connections/${connectionId}/connect/manual`, {});
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['marketplace-status'] });
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

export function useMarketplaceCatalogMappings() {
  return useQuery({
    queryKey: ['marketplace-catalog-mappings'],
    queryFn: async () => {
      const res = await api.get<MarketplaceCatalogMappingDTO[]>('/marketplaces/catalog-mappings');
      return res.data ?? [];
    },
  });
}

export function useMarketplaceCatalogMappingCandidates() {
  return useQuery({
    queryKey: ['marketplace-catalog-mapping-candidates'],
    queryFn: async () => {
      const res = await api.get<MarketplaceCatalogMappingCandidateDTO[]>('/marketplaces/catalog-mapping-candidates');
      return res.data ?? [];
    },
  });
}

export function useUpsertMarketplaceCatalogMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertMarketplaceCatalogMappingInput) => {
      const res = await api.post<MarketplaceCatalogMappingDTO>('/marketplaces/catalog-mappings', input);
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['marketplace-catalog-mappings'] });
      await queryClient.invalidateQueries({ queryKey: ['marketplace-catalog-mapping-candidates'] });
      await queryClient.invalidateQueries({ queryKey: ['marketplace-orders'] });
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

export type Food99SelfServiceAuthorizationDTO = {
  authorizationUrl: string;
  connection: MarketplaceConnectionDTO;
};

export type Food99SelfServiceVerificationDTO = {
  authorized: true;
  connection: MarketplaceConnectionDTO;
} | {
  authorized: false;
  state: 'AUTHORIZED_SHOP_SELECTION_REQUIRED';
  candidates: Array<{ shopId: string; shopName: string | null }>;
  connection: MarketplaceConnectionDTO;
};

export function useStartFood99SelfServiceAuthorization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { connectionId?: string; createNew?: boolean }) => {
      const res = await api.post<Food99SelfServiceAuthorizationDTO>('/marketplaces/99food/self-service/authorization', input);
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['marketplace-connections'] });
      await queryClient.invalidateQueries({ queryKey: ['marketplace-status', '99food'] });
    },
  });
}

export function useVerifyFood99SelfServiceAuthorization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { connectionId: string }) => {
      const res = await api.post<Food99SelfServiceVerificationDTO>('/marketplaces/99food/self-service/verify', input);
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['marketplace-connections'] });
      await queryClient.invalidateQueries({ queryKey: ['marketplace-status', '99food'] });
      await queryClient.invalidateQueries({ queryKey: ['marketplace-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['marketplace-events'] });
    },
  });
}

export function useBindFood99SelfServiceAuthorization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { connectionId: string; shopId: string }) => {
      const res = await api.post<Food99SelfServiceVerificationDTO>('/marketplaces/99food/self-service/bind', input);
      return res.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['marketplace-connections'] });
      await queryClient.invalidateQueries({ queryKey: ['marketplace-status', '99food'] });
      await queryClient.invalidateQueries({ queryKey: ['marketplace-orders'] });
      await queryClient.invalidateQueries({ queryKey: ['marketplace-events'] });
    },
  });
}
