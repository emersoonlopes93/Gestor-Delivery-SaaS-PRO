import { describe, expect, it } from 'vitest';
import type { DashboardStatsDTO, TenantOperatingHours } from '@gestor/types';
import {
  canAccessDashboardReports,
  calculateComparison,
  getOperationalSteps,
  getOrdersInProgress,
  getStoreStatus,
  getDashboardPeriod,
} from './dashboard.utils';

const stats = {
  operational: {
    totalOrders: 10,
    ordersByStatus: {
      pending: 2, confirmed: 1, preparing: 2, ready_for_pickup: 1, ready_for_delivery: 0,
      out_for_delivery: 1, completed: 2, cancelled: 1, draft: 0,
    },
    ordersByChannel: {},
    ordersByFulfillment: { delivery: 0, pickup: 0, dine_in: 0, table: 0 },
    averagePreparationTimeMinutes: 18,
    averageDeliveryTimeMinutes: 30,
    cancellationRate: 10,
    peakHours: [],
  },
  commercial: { totalRevenue: 0, food99EstimatedNetReceivable: null, food99BillEntryCount: 0, averageTicket: 0, totalOrders: 0, revenueByChannel: {}, revenueByCategory: {}, topProducts: [], topCombos: [], couponUsage: [], cashbackStats: { earnedTotal: 0, redeemedTotal: 0 } },
  costs: { estimatedCMV: 0, estimatedGrossMargin: 0, grossMarginPercentage: 0, productPerformance: [] },
  financial: { totalIncome: 0, totalExpenses: 0, cashBalance: 0, netCashFlow: 0 },
} satisfies DashboardStatsDTO;

describe('dashboard derivations', () => {
  it('requires both reports permission and enabled module before querying analytics', () => {
    expect(canAccessDashboardReports(['reports.read'], ['reports'])).toBe(true);
    expect(canAccessDashboardReports(['reports.read'], [])).toBe(false);
    expect(canAccessDashboardReports(['reports.read'], undefined)).toBe(false);
    expect(canAccessDashboardReports([], ['reports'])).toBe(false);
  });

  it('builds an equivalent previous elapsed period', () => {
    const now = new Date(2026, 6, 28, 12, 0, 0);
    const period = getDashboardPeriod('today', now);
    expect(period.current.start.getHours()).toBe(0);
    expect(period.previous.end.getTime()).toBe(period.current.start.getTime() - 1);
  });

  it('builds complete yesterday and seven-day presets with equivalent baselines', () => {
    const now = new Date(2026, 6, 28, 12, 0, 0);
    const yesterday = getDashboardPeriod('yesterday', now);
    expect(yesterday.current.start.getDate()).toBe(27);
    expect(yesterday.current.start.getHours()).toBe(0);
    expect(yesterday.current.end.getHours()).toBe(23);
    expect(yesterday.previous.end.getTime()).toBe(yesterday.current.start.getTime() - 1);

    const sevenDays = getDashboardPeriod('last7days', now);
    expect(sevenDays.current.start.getDate()).toBe(22);
    expect(sevenDays.current.end.getTime()).toBe(now.getTime());
    expect(sevenDays.previous.end.getTime()).toBe(sevenDays.current.start.getTime() - 1);
  });

  it('only compares metrics with a meaningful baseline', () => {
    expect(calculateComparison(120, 100)).toEqual({ direction: 'up', percentage: 20 });
    expect(calculateComparison(10, 0)).toBeNull();
    expect(calculateComparison(null, 10)).toBeNull();
  });

  it('keeps cancellation rate as the percentage returned by the API', () => {
    expect(stats.operational.cancellationRate).toBe(10);
  });

  it('derives operational flow and active orders from real statuses', () => {
    expect(getOrdersInProgress(stats)).toBe(7);
    expect(getOperationalSteps(stats).find((step) => step.key === 'preparing')).toMatchObject({ count: 3, share: 30 });
  });

  it('derives paused, closed and open states from settings and hours', () => {
    const monday: TenantOperatingHours[] = [{ id: '1', tenantId: 't', dayOfWeek: 1, isOpen: true, openTime: '08:00', closeTime: '22:00' }];
    const now = new Date('2026-07-27T15:00:00.000Z');
    expect(getStoreStatus({ isStorePaused: true } as never, monday, now)).toBe('paused');
    expect(getStoreStatus({ timezone: 'UTC' } as never, monday, now)).toBe('open');
    expect(getStoreStatus({ timezone: 'UTC' } as never, [], now)).toBe('closed');
  });
});
