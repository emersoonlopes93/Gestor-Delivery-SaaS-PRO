import { api } from '../../lib/api-client';

export type DecimalLike = string | number;

export type TenantBillingSource = 'billing_v2' | 'legacy_fallback' | 'none';

export type TenantBillingRevenueTier = {
  id: string;
  planId: string;
  minRevenue: DecimalLike;
  maxRevenue: DecimalLike | null;
  price: DecimalLike;
  label: string | null;
  sortOrder: number;
  isActive: boolean;
};

export type TenantBillingSubscription = {
  id: string;
  tenantId: string;
  billingPlanId: string;
  status: string;
  startedAt: string;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  currentCycleStartedAt: string | null;
  currentCycleEndsAt: string | null;
  canceledAt: string | null;
  suspendedAt: string | null;
  gracePeriodEndsAt: string | null;
  requiresPaymentMethod: boolean;
  provider: string | null;
};

export type TenantBillingPlan = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  cycleInterval: string;
  currency: string;
  trialDays: number;
  requiresPaymentMethod: boolean;
  allowAllModules: boolean;
  isActive: boolean;
  isPublic: boolean;
  revenueTiers: TenantBillingRevenueTier[];
};

export type TenantBillingCycle = {
  id: string;
  tenantId: string;
  subscriptionId: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
  measuredRevenue: DecimalLike;
  billableRevenue: DecimalLike;
  baseAmount: DecimalLike;
  addonsAmount: DecimalLike;
  totalAmount: DecimalLike;
  currency: string;
  selectedTier: TenantBillingRevenueTier | null;
};

export type TenantBillingUsagePreview = {
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  includedChannels: string[];
  includedStatuses: string[];
  ordersCount: number;
  excludedOrdersCount: number;
  grossOrdersAmount: DecimalLike;
  itemsSubtotalAmount: DecimalLike;
  discountsAmount: DecimalLike;
  deliveryFeeAmount: DecimalLike;
  serviceFeeAmount: DecimalLike;
  billableAmount: DecimalLike;
  calculatedAt: string;
  rating?: {
    planId: string;
    selectedTier: TenantBillingRevenueTier | null;
    currentMonthlyPrice: DecimalLike;
    nextTier: TenantBillingRevenueTier | null;
    revenueUntilNextTier: DecimalLike | null;
    currency: string;
  };
};

export type TenantBillingInvoiceSummary = {
  id: string;
  number: string;
  status: string;
  total: DecimalLike;
  dueDate: string;
  paidAt: string | null;
  provider: string;
  providerPaymentUrl: string | null;
  createdAt: string;
};

export type TenantBillingPaymentAttempt = {
  id: string;
  invoiceId: string;
  tenantId: string;
  provider: string;
  status: string;
  mode: string;
  amount: DecimalLike;
  errorCode: string | null;
  errorMessage: string | null;
  providerPaymentId: string | null;
  attemptedAt: string;
  createdAt: string;
};

export type TenantBillingUsageSnapshot = {
  id: string;
  tenantId: string;
  cycleId: string | null;
  periodStart: string;
  periodEnd: string;
  sourceChannel: string | null;
  ordersCount: number;
  grossOrdersAmount: DecimalLike;
  discountsAmount: DecimalLike;
  deliveryFeeAmount: DecimalLike;
  serviceFeeAmount: DecimalLike;
  billableAmount: DecimalLike;
  createdAt: string;
};

export type TenantBillingInvoiceItem = {
  id: string;
  invoiceId: string;
  type: string;
  description: string;
  quantity: number;
  unitAmount: DecimalLike;
  totalAmount: DecimalLike;
  createdAt: string;
};

export type TenantBillingInvoiceDetails = {
  invoice: TenantBillingInvoiceSummary & {
    subscriptionId: string;
    cycleId: string | null;
    subtotal: DecimalLike;
    discountTotal: DecimalLike;
    taxTotal: DecimalLike;
    currency: string;
    openedAt: string | null;
    failedAt: string | null;
    voidedAt: string | null;
    providerInvoiceId: string | null;
  };
  items: TenantBillingInvoiceItem[];
  cycle: TenantBillingCycle | null;
  snapshot: TenantBillingUsageSnapshot | null;
  paymentAttempts: TenantBillingPaymentAttempt[];
  providerPaymentUrl: string | null;
};

export type TenantBillingOverview = {
  subscription: TenantBillingSubscription | null;
  plan: TenantBillingPlan | null;
  currentCycle: TenantBillingCycle | null;
  usagePreview: TenantBillingUsagePreview | null;
  selectedTier: TenantBillingRevenueTier | null;
  nextTier: TenantBillingRevenueTier | null;
  estimatedMonthlyPrice: DecimalLike | null;
  revenueUntilNextTier: DecimalLike | null;
  latestInvoice: TenantBillingInvoiceSummary | null;
  paymentModeInfo: {
    paymentsEnabled: boolean;
    provider: string;
    mode: string;
    productionAllowed: boolean;
    supportedProviders: string[];
    automaticBillingActive: false;
    message: string;
  };
  source: TenantBillingSource;
  warning: string | null;
  entitlements: {
    commercialStatus: string;
    billableRevenue: DecimalLike;
    estimatedBasePrice: DecimalLike;
    addonsAmount: DecimalLike;
    estimatedTotalPrice: DecimalLike;
    activeAddons: Array<{
      id: string;
      addonKey: string;
      status: string;
      price: DecimalLike;
      cancelAtCycleEnd: boolean;
      billingAddon?: { name: string | null } | null;
    }>;
    ai: {
      canUse: boolean;
      source: string;
      monthlyLimit: number;
      usedThisMonth: number;
      remainingThisMonth: number;
    };
    flags: {
      canUseAiAgent: boolean;
      canUseIfoodIntegration: boolean;
      canUseAdvancedReports: boolean;
      canUseCampaigns: boolean;
      canUseCustomDomain: boolean;
      canUsePrioritySupport: boolean;
    };
    channelsIncludedInBilling: string[];
    trialAvailable: boolean;
  };
  partners: Array<{
    key: string;
    title: string;
    description: string;
    ctaLabel: string;
    url: string;
  }>;
};

export async function getTenantBillingOverview(): Promise<TenantBillingOverview> {
  const response = await api.get<TenantBillingOverview>('/billing/me');
  return response.data;
}

export async function startTrialPro(): Promise<TenantBillingOverview> {
  const response = await api.post<TenantBillingOverview>('/billing/trial-pro/start');
  return response.data;
}

export async function activateAiAddon(): Promise<TenantBillingOverview> {
  const response = await api.post<TenantBillingOverview>('/billing/addons/ai-agent/activate');
  return response.data;
}

export async function cancelAiAddon(): Promise<TenantBillingOverview> {
  const response = await api.post<TenantBillingOverview>('/billing/addons/ai-agent/cancel');
  return response.data;
}

export async function listTenantBillingInvoices(): Promise<TenantBillingInvoiceSummary[]> {
  const response = await api.get<TenantBillingInvoiceSummary[]>('/billing/me/invoices');
  return response.data;
}

export async function getTenantBillingInvoiceDetails(invoiceId: string): Promise<TenantBillingInvoiceDetails> {
  const response = await api.get<TenantBillingInvoiceDetails>(`/billing/me/invoices/${invoiceId}`);
  return response.data;
}
