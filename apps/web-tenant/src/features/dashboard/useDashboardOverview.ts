import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hasPermission } from '@gestor/auth';
import type {
  BusinessGroupContext,
  DashboardOperationalDTO,
  Product,
  ProductCategory,
  Tenant,
  TenantOperatingHours,
  TenantSettings,
} from '@gestor/types';
import { api } from '../../lib/api-client';
import { useAuthStore } from '../../stores/auth.store';
import {
  canAccessDashboardReports,
  getOperationalDashboardPeriod,
  getStoreStatus,
  type DashboardPeriodPreset,
} from './dashboard.utils';

export type TenantOverview = Tenant & {
  settings: TenantSettings;
  operatingHours: TenantOperatingHours[];
  businessGroup?: BusinessGroupContext | null;
};

export type TenantBillingState = {
  subscriptionStatus: string | null;
  warning: string | null;
};

const operationalUrl = (from: string, to: string) =>
  `/dashboard/operational?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

export function useDashboardOverview(periodPreset: DashboardPeriodPreset) {
  const { user } = useAuthStore();
  const permissions = user?.permissions ?? [];
  const canViewDashboard = hasPermission(permissions, 'dashboard.view');
  const canReadReports = canAccessDashboardReports(permissions, user?.enabledModules);
  const canReadBilling = hasPermission(permissions, 'billing.read');
  const canReadCatalog = hasPermission(permissions, 'catalog.read');
  const canReadSettings = hasPermission(permissions, 'settings.read');
  const sessionKey = [user?.tenantId ?? null, user?.userId ?? null, canViewDashboard, canReadReports] as const;

  const tenantQuery = useQuery({
    queryKey: ['tenant-settings', ...sessionKey],
    queryFn: async () => (await api.get<TenantOverview>('/tenant/me')).data,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const setupQuery = useQuery({
    queryKey: ['dashboard-setup-state', ...sessionKey, canReadSettings, canReadCatalog],
    queryFn: async () => {
      const [hours, categories, products] = await Promise.all([
        canReadSettings ? api.get<TenantOperatingHours[]>('/tenant/operating-hours') : null,
        canReadCatalog ? api.get<ProductCategory[]>('/catalog/categories') : null,
        canReadCatalog ? api.get<Product[]>('/catalog/products') : null,
      ]);
      return {
        operatingHours: hours?.success ? hours.data : [],
        hasCategories: categories?.success === true && categories.data.length > 0,
        hasProducts: products?.success === true && products.data.length > 0,
      };
    },
    enabled: canReadSettings || canReadCatalog,
    staleTime: 5 * 60 * 1000,
  });

  const operationalPeriod = useMemo(
    () => getOperationalDashboardPeriod(periodPreset, tenantQuery.data?.settings?.timezone),
    [periodPreset, tenantQuery.data?.settings?.timezone],
  );

  const operationalQuery = useQuery({
    queryKey: ['dashboard-operational', ...sessionKey, operationalPeriod.from, operationalPeriod.to],
    queryFn: async () => {
      const response = await api.get<DashboardOperationalDTO>(operationalUrl(operationalPeriod.from, operationalPeriod.to));
      if (!response.success) throw new Error('Operational dashboard request failed');
      return response.data;
    },
    enabled: canViewDashboard && tenantQuery.isSuccess,
    retry: 1,
  });

  const billingQuery = useQuery({
    queryKey: ['billing-state', 'dashboard-warning', ...sessionKey],
    queryFn: async () => (await api.get<TenantBillingState>('/billing/state')).data,
    enabled: canReadBilling,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const operatingHours = tenantQuery.data?.operatingHours ?? setupQuery.data?.operatingHours ?? [];
  const setupAvailable = canReadSettings && canReadCatalog;
  return {
    user,
    tenant: tenantQuery.data ?? null,
    setup: setupAvailable ? setupQuery.data ?? { operatingHours, hasCategories: false, hasProducts: false } : null,
    current: operationalQuery.data ?? null,
    billing: billingQuery.data ?? null,
    storeStatus: getStoreStatus(tenantQuery.data?.settings, operatingHours),
    canReadReports,
    isLoading: tenantQuery.isLoading || (setupAvailable && setupQuery.isLoading) || (canViewDashboard && operationalQuery.isLoading),
    hasOperationalError: canViewDashboard && operationalQuery.isError,
    hasPartialError: tenantQuery.isError || (setupAvailable && setupQuery.isError) || (canViewDashboard && operationalQuery.isError),
    refetch: async () => {
      const requests: Array<Promise<unknown>> = [tenantQuery.refetch()];
      if (setupAvailable) requests.push(setupQuery.refetch());
      if (canViewDashboard) requests.push(operationalQuery.refetch());
      if (canReadBilling) requests.push(billingQuery.refetch());
      await Promise.all(requests);
    },
  };
}
