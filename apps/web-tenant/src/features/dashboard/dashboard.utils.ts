import type { DashboardOperationalDTO, DashboardStatsDTO, OrderStatus, TenantOperatingHours, TenantSettings } from '@gestor/types';
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

type DashboardOperationalMetrics = Pick<DashboardOperationalDTO, 'orders'>
  | Pick<DashboardStatsDTO, 'operational'>;

function orderStatusCounts(metrics: DashboardOperationalMetrics | null) {
  if (!metrics) return null;
  return 'orders' in metrics ? metrics.orders.byStatus : metrics.operational.ordersByStatus;
}

function totalOrders(metrics: DashboardOperationalMetrics | null) {
  if (!metrics) return 0;
  return 'orders' in metrics ? metrics.orders.total : metrics.operational.totalOrders;
}

const countStatuses = (metrics: DashboardOperationalMetrics | null, statuses: OrderStatus[]) => {
  const byStatus = orderStatusCounts(metrics);
  return statuses.reduce((total, status) => total + (byStatus?.[status] ?? 0), 0);
};

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

function calendarDateInTimezone(now: Date, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
    const year = value('year');
    const month = value('month');
    const day = value('day');
    if (year && month && day) return `${year}-${month}-${day}`;
  } catch {
    // The API validates the configured tenant timezone. Use the local calendar only as a safe UI fallback.
  }

  return now.toISOString().slice(0, 10);
}

function shiftCalendarDate(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Builds the API's inclusive YYYY-MM-DD query in the tenant calendar. The
 * operational API owns interval validation and caps requests at 31 days.
 */
export function getOperationalDashboardPeriod(
  preset: DashboardPeriodPreset,
  timezone: string | null | undefined,
  now = new Date(),
) {
  const to = calendarDateInTimezone(now, timezone || 'America/Sao_Paulo');
  const days = preset === 'last7days' ? 7 : 1;
  const from = preset === 'yesterday' ? shiftCalendarDate(to, -1) : shiftCalendarDate(to, -(days - 1));
  return { from, to: preset === 'yesterday' ? from : to };
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

export function getOrdersInProgress(metrics: DashboardOperationalMetrics | null) {
  return countStatuses(metrics, ['pending', 'confirmed', 'preparing', 'ready_for_pickup', 'ready_for_delivery', 'out_for_delivery']);
}

export function getOperationalSteps(metrics: DashboardOperationalMetrics | null): OperationalStep[] {
  const total = totalOrders(metrics);
  const makeStep = (
    key: string,
    label: string,
    statuses: OrderStatus[],
    tone: OperationalStep['tone'],
  ): OperationalStep => {
    const count = countStatuses(metrics, statuses);
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
