import type { DashboardStatsDTO, OrderStatus, TenantOperatingHours, TenantSettings } from '@gestor/types';
import { hasPermission } from '@gestor/auth';
import { resolveStoreOperationalStatus, type StoreOperationalStatus } from '../../components/store/store-operational-status';

export type { StoreOperationalStatus } from '../../components/store/store-operational-status';
export type DashboardPeriodPreset = 'today' | 'yesterday' | 'last7days';

export const DASHBOARD_PERIOD_LABELS: Record<DashboardPeriodPreset, { control: string; sentence: string }> = {
  today: { control: 'Hoje', sentence: 'hoje' },
  yesterday: { control: 'Ontem', sentence: 'ontem' },
  last7days: { control: 'Últimos 7 dias', sentence: 'nos últimos 7 dias' },
};

export type MetricComparison = {
  direction: 'up' | 'down' | 'flat';
  percentage: number;
} | null;

export type OperationalStep = {
  key: string;
  label: string;
  count: number;
  share: number;
  tone: 'sky' | 'amber' | 'indigo' | 'emerald' | 'slate';
};

const countStatuses = (stats: DashboardStatsDTO | null, statuses: OrderStatus[]) =>
  statuses.reduce((total, status) => total + (stats?.operational.ordersByStatus[status] ?? 0), 0);

export function canAccessDashboardReports(permissions: string[], enabledModules: string[] | undefined) {
  return hasPermission(permissions, 'reports.read')
    && Array.isArray(enabledModules)
    && enabledModules.includes('reports');
}

export function getDashboardPeriod(preset: DashboardPeriodPreset, now = new Date()) {
  const end = new Date(now);
  const start = new Date(now);
  if (preset === 'yesterday') {
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999);
  } else {
    if (preset === 'last7days') start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  }
  const duration = Math.max(end.getTime() - start.getTime(), 1);
  return {
    preset,
    current: { start, end },
    previous: {
      start: new Date(start.getTime() - duration),
      end: new Date(start.getTime() - 1),
    },
  };
}

export function calculateComparison(current: number | null | undefined, previous: number | null | undefined): MetricComparison {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) {
    return null;
  }
  const percentage = ((current - previous) / Math.abs(previous)) * 100;
  return {
    direction: Math.abs(percentage) < 0.05 ? 'flat' : percentage > 0 ? 'up' : 'down',
    percentage: Math.abs(percentage),
  };
}

export function getStoreStatus(
  settings: TenantSettings | null | undefined,
  operatingHours: TenantOperatingHours[],
  now = new Date(),
): StoreOperationalStatus {
  return resolveStoreOperationalStatus(settings, operatingHours, now).status;
}

export function getOrdersInProgress(stats: DashboardStatsDTO | null) {
  return countStatuses(stats, ['pending', 'confirmed', 'preparing', 'ready_for_pickup', 'ready_for_delivery', 'out_for_delivery']);
}

export function getOperationalSteps(stats: DashboardStatsDTO | null): OperationalStep[] {
  const total = stats?.operational.totalOrders ?? 0;
  const makeStep = (
    key: string,
    label: string,
    statuses: OrderStatus[],
    tone: OperationalStep['tone'],
  ): OperationalStep => {
    const count = countStatuses(stats, statuses);
    return { key, label, count, share: total > 0 ? (count / total) * 100 : 0, tone };
  };
  return [
    { key: 'received', label: 'Recebidos', count: total, share: total > 0 ? 100 : 0, tone: 'sky' },
    makeStep('awaiting', 'Aguardando', ['pending'], 'amber'),
    makeStep('preparing', 'Em preparo', ['confirmed', 'preparing'], 'indigo'),
    makeStep('ready', 'Prontos', ['ready_for_pickup', 'ready_for_delivery'], 'emerald'),
    makeStep('delivery', 'Em entrega', ['out_for_delivery'], 'sky'),
    makeStep('completed', 'Concluídos', ['completed'], 'slate'),
  ];
}

export function channelLabel(channel: string) {
  const normalized = channel.toLowerCase();
  if (normalized.includes('whatsapp')) return 'WhatsApp';
  if (normalized.includes('ifood')) return 'iFood';
  if (normalized.includes('pos') || normalized.includes('counter')) return 'Balcão / PDV';
  if (normalized.includes('storefront') || normalized.includes('menu') || normalized.includes('web')) return 'Cardápio próprio';
  return channel;
}

export function formatHour(hour: number) {
  return `${String(hour).padStart(2, '0')}h`;
}
