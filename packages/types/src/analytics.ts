import { OrderStatus, FulfillmentType } from './order';

/**
 * Historical CMV coverage is intentionally explicit: a partial subtotal must
 * never be consumed as a complete cost or margin figure.
 */
export type HistoricalCmvCoverageStatus = 'KNOWN' | 'PARTIAL' | 'UNKNOWN';

export interface HistoricalCmvIngredientLineDTO {
  ingredientId: string;
  /** Quantity is serialized as Decimal text in the ingredient base unit. */
  quantity: string;
  unitCost: string | null;
  lineCost: string | null;
  movementId: string;
  isActive: boolean;
  reversalMovementId?: string;
  costEvidence: 'KNOWN' | 'UNKNOWN';
}

/**
 * Read-only historical CMV derived from persisted theoretical stock facts.
 * `totalCmv` is usable only for KNOWN coverage; `knownSubtotal` is never a
 * substitute for a complete order cost.
 */
export interface HistoricalOrderCmvDTO {
  orderId: string;
  coverageStatus: HistoricalCmvCoverageStatus;
  knownSubtotal: string;
  totalCmv: string | null;
  coverageReasons: string[];
  ingredients: HistoricalCmvIngredientLineDTO[];
}

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
  /** Omitted when the authenticated user cannot view cost and margin data. */
  costs?: CostMarginMetricsDTO;
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

/**
 * Read-only dashboard data that is safe for operational staff.  It deliberately
 * contains order volume and completed-order totals only; it is not a financial
 * statement, receivables view, or profitability report.
 */
export interface DashboardOperationalDTO {
  period: {
    from: string;
    to: string;
    timezone: string;
  };
  orders: {
    total: number;
    byStatus: Record<OrderStatus, number>;
    cancelled: number;
    cancellationRate: number;
  };
  completedSales: {
    orderCount: number;
    grossOrderTotal: number;
    averageTicket: number;
  };
}
