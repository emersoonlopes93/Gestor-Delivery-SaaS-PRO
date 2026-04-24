import { OrderStatus, FulfillmentType } from './order';

export interface OperationalMetricsDTO {
  totalOrders: number;
  ordersByStatus: Record<OrderStatus, number>;
  ordersByChannel: Record<string, number>;
  ordersByFulfillment: Record<FulfillmentType, number>;
  averagePreparationTimeMinutes: number;
  averageDeliveryTimeMinutes: number;
  cancellationRate: number;
  peakHours: Array<{ hour: number; count: number }>;
}

export interface CommercialMetricsDTO {
  totalRevenue: number;
  averageTicket: number;
  totalOrders: number;
  revenueByChannel: Record<string, number>;
  revenueByCategory: Record<string, number>;
  topProducts: Array<{
    id: string;
    name: string;
    quantity: number;
    revenue: number;
  }>;
  topCombos: Array<{
    id: string;
    name: string;
    quantity: number;
    revenue: number;
  }>;
  couponUsage: Array<{
    id: string;
    code: string;
    usageCount: number;
    discountTotal: number;
  }>;
  cashbackStats: {
    earnedTotal: number;
    redeemedTotal: number;
  };
}

export interface CostMarginMetricsDTO {
  estimatedCMV: number;
  estimatedGrossMargin: number;
  grossMarginPercentage: number;
  productPerformance: Array<{
    id: string;
    name: string;
    estimatedCost: number;
    revenue: number;
    grossMargin: number;
    marginPercentage: number;
  }>;
  categoryPerformance?: Array<{
    name: string;
    revenue: number;
    cost: number;
    grossMargin: number;
    marginPercentage: number;
  }>;
  channelPerformance?: Array<{
    name: string;
    revenue: number;
    cost: number;
    grossMargin: number;
    marginPercentage: number;
  }>;
}

export interface DashboardStatsDTO {
  operational: OperationalMetricsDTO;
  commercial: CommercialMetricsDTO;
  costs: CostMarginMetricsDTO;
  financial: {
    totalIncome: number;
    totalExpenses: number;
    cashBalance: number;
    netCashFlow: number;
  };
}

export interface MetricFilterDTO {
  startDate: string;
  endDate: string;
  channel?: string;
}
