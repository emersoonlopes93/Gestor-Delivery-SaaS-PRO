import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { hasPermission } from '@gestor/auth';
import type {
  BusinessGroupContext,
  DashboardStatsDTO,
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
  canAccessDashboard,
  getDashboardPeriod,
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

const analyticsUrl = (start: Date, end: Date) =>
  `/analytics/dashboard?startDate=${encodeURIComponent(start.toISOString())}&endDate=${encodeURIComponent(end.toISOString())}`;

export function useDashboardOverview(periodPreset: DashboardPeriodPreset) {
  const { user } = useAuthStore();
  const permissions = user?.permissions ?? [];
  const canViewDashboard = canAccessDashboard(permissions);
  const canReadReports = canAccessDashboardReports(permissions, user?.enabledModules);
  const canReadBilling = hasPermission(permissions, 'billing.read');
  const canReadCatalog = hasPermission(permissions, 'catalog.read');
  const canReadSettings = hasPermission(permissions, 'settings.read');
  const period = useMemo(() => getDashboardPeriod(periodPreset), [periodPreset]);

  const tenantQuery = useQuery({
    queryKey: ['tenant-settings'],
    queryFn: async () => (await api.get<TenantOverview>('/tenant/me')).data,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    enabled: canViewDashboard,
  });

  const setupQuery = useQuery({
    queryKey: ['dashboard-setup-state'],
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
    enabled: canViewDashboard && (canReadSettings || canReadCatalog),
    staleTime: 5 * 60 * 1000,
  });

  const analyticsQuery = useQuery({
    queryKey: ['analytics-dashboard', periodPreset, period.current.start.toISOString(), period.current.end.toISOString()],
    queryFn: async () => {
      const [current, previous] = await Promise.all([
        api.get<DashboardStatsDTO>(analyticsUrl(period.current.start, period.current.end)),
        api.get<DashboardStatsDTO>(analyticsUrl(period.previous.start, period.previous.end)),
      ]);
      return {
        current: current.success ? current.data : null,
        previous: previous.success ? previous.data : null,
      };
    },
    enabled: canViewDashboard && canReadReports,
    retry: 1,
  });

  const billingQuery = useQuery({
    queryKey: ['billing-state', 'dashboard-warning'],
    queryFn: async () => (await api.get<TenantBillingState>('/billing/state')).data,
    enabled: canViewDashboard && canReadBilling,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const operatingHours = tenantQuery.data?.operatingHours ?? setupQuery.data?.operatingHours ?? [];
  const setupAvailable = canViewDashboard && canReadSettings && canReadCatalog;
  return {
    user,
    tenant: tenantQuery.data ?? null,
    setup: setupAvailable ? setupQuery.data ?? { operatingHours, hasCategories: false, hasProducts: false } : null,
    current: analyticsQuery.data?.current ?? null,
    previous: analyticsQuery.data?.previous ?? null,
    billing: billingQuery.data ?? null,
    storeStatus: getStoreStatus(tenantQuery.data?.settings, operatingHours),
    canViewDashboard,
    canReadReports,
    isLoading: tenantQuery.isLoading || (setupAvailable && setupQuery.isLoading) || (canReadReports && analyticsQuery.isLoading),
    isAnalyticsLoading: canReadReports && analyticsQuery.isLoading,
    hasPartialError: tenantQuery.isError || (setupAvailable && setupQuery.isError) || (canReadReports && analyticsQuery.isError),
    refetch: async () => {
      const requests: Array<Promise<unknown>> = [tenantQuery.refetch()];
      if (setupAvailable) requests.push(setupQuery.refetch());
      if (canReadReports) requests.push(analyticsQuery.refetch());
      if (canReadBilling) requests.push(billingQuery.refetch());
      await Promise.all(requests);
    },
  };
}
