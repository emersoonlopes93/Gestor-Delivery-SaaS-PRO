import { api } from '../../lib/api-client';

export type DecimalLike = string | number;

export type BillingRevenueTier = {
  id: string;
  planId: string;
  minRevenue: DecimalLike;
  maxRevenue: DecimalLike | null;
  price: DecimalLike;
  label: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type BillingPlanV2 = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  cycleInterval: string;
  isActive: boolean;
  isPublic: boolean;
  currency: string;
  trialDays: number;
  requiresPaymentMethod: boolean;
  allowAllModules: boolean;
  includedModulesLimit: number | null;
  createdAt: string;
  updatedAt: string;
  revenueTiers: BillingRevenueTier[];
};

export type BillingSettings = {
  id: string;
  includeDeliveryFeeByDefault: boolean;
  includeServiceFeeByDefault: boolean;
  countStorefrontOrders: boolean;
  countPosOrders: boolean;
  countWhatsappAiOrders: boolean;
  countManualOrders: boolean;
  countConfirmedOrders: boolean;
  countCompletedOrders: boolean;
  excludeCancelledOrders: boolean;
  discountReducesRevenue: boolean;
  defaultGracePeriodDays: number;
  defaultTrialDays: number;
  requirePaymentMethodForPaidPlans: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BillingRevenueTierInput = {
  id?: string;
  minRevenue: DecimalLike;
  maxRevenue: DecimalLike | null;
  price: DecimalLike;
  label: string | null;
};

export type UpdateBillingPlanV2Body = {
  name: string;
  description: string | null;
  trialDays: number;
  requiresPaymentMethod: boolean;
  allowAllModules: boolean;
  isActive: boolean;
  isPublic: boolean;
  tiers: BillingRevenueTierInput[];
};

export type UpdateBillingSettingsBody = {
  includeDeliveryFeeByDefault: boolean;
  includeServiceFeeByDefault: boolean;
  countStorefrontOrders: boolean;
  countPosOrders: boolean;
  countWhatsappAiOrders: boolean;
  countManualOrders: boolean;
  countConfirmedOrders: boolean;
  countCompletedOrders: boolean;
  excludeCancelledOrders: boolean;
  discountReducesRevenue: boolean;
  defaultGracePeriodDays: number;
  defaultTrialDays: number;
  requirePaymentMethodForPaidPlans: boolean;
};

export type AdminTenantListItem = {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export type PaginatedTenants = {
  items: AdminTenantListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
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
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  legacyTenantSubscriptionId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BillingUsageSnapshot = {
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

export type BillingCycleRecord = {
  id: string;
  tenantId: string;
  subscriptionId: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
  measuredRevenue: DecimalLike;
  billableRevenue: DecimalLike;
  selectedTierId: string | null;
  baseAmount: DecimalLike;
  addonsAmount: DecimalLike;
  totalAmount: DecimalLike;
  currency: string;
  createdAt: string;
  updatedAt: string;
  selectedTier?: BillingRevenueTier | null;
  usageSnapshots?: BillingUsageSnapshot[];
  invoices?: InvoiceSummary[];
};

export type InvoiceItem = {
  id: string;
  invoiceId: string;
  type: string;
  description: string;
  quantity: number;
  unitAmount: DecimalLike;
  totalAmount: DecimalLike;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type InvoiceSummary = {
  id: string;
  tenantId: string;
  subscriptionId: string;
  cycleId: string | null;
  number: string;
  status: string;
  subtotal: DecimalLike;
  discountTotal: DecimalLike;
  taxTotal: DecimalLike;
  total: DecimalLike;
  currency: string;
  dueDate: string;
  paidAt: string | null;
  openedAt: string | null;
  failedAt: string | null;
  voidedAt: string | null;
  provider: string;
  providerInvoiceId: string | null;
  providerPaymentUrl: string | null;
  createdAt: string;
  updatedAt: string;
  tenant?: AdminTenantListItem;
  cycle?: BillingCycleRecord | null;
  items?: InvoiceItem[];
  subscription?: TenantBillingSubscription & { billingPlan?: BillingPlanV2 };
  paymentAttempts?: PaymentAttempt[];
};

export type PaymentAttempt = {
  id: string;
  invoiceId: string;
  tenantId: string;
  provider: 'manual' | 'mock' | 'asaas' | string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled' | string;
  mode: 'manual' | 'sandbox' | 'production' | string;
  idempotencyKey: string | null;
  amount: DecimalLike;
  errorCode: string | null;
  errorMessage: string | null;
  providerPaymentId: string | null;
  metadataJson: Record<string, unknown> | null;
  requestJson: Record<string, unknown> | null;
  responseJson: Record<string, unknown> | null;
  attemptedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type BillingPaymentConfig = {
  paymentsEnabled: boolean;
  provider: 'manual' | 'mock' | 'asaas' | string;
  mode: 'disabled' | 'manual' | 'sandbox' | 'production';
  productionAllowed: boolean;
  supportedProviders: string[];
};

export type UsageRatingPreview = {
  planId: string;
  selectedTier: BillingRevenueTier | null;
  currentMonthlyPrice: DecimalLike;
  nextTier: BillingRevenueTier | null;
  revenueUntilNextTier: DecimalLike | null;
  currency: string;
};

export type BillingUsagePreview = {
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
  rating?: UsageRatingPreview;
};

export type DraftInvoiceItemPreview = {
  type: string;
  description: string;
  quantity: number;
  unitAmount: DecimalLike;
  totalAmount: DecimalLike;
  metadata: Record<string, unknown>;
};

export type BillingCycleInvoicePreview = {
  cycle: BillingCycleRecord & { subscription: TenantBillingSubscription };
  usage: BillingUsagePreview;
  selectedTier: BillingRevenueTier | null;
  baseAmount: DecimalLike;
  addonsAmount: DecimalLike;
  totalAmount: DecimalLike;
  currency: string;
  invoiceItems: DraftInvoiceItemPreview[];
};

export type TenantBillingSubscriptionResponse = {
  subscription: TenantBillingSubscription | null;
  plan: BillingPlanV2 | null;
  tenant: AdminTenantListItem | null;
  currentCycle: BillingCycleRecord | null;
  latestInvoice: InvoiceSummary | null;
  calculatedStatus: string;
};

export type BillingOverview = {
  totalTenants: number;
  tenantsWithBilling: number;
  tenantsWithoutNewBilling: number;
  draftInvoices: number;
  openCycles: number;
  closedCycles: number;
  monthBillableRevenue: DecimalLike;
  estimatedSaasRevenue: DecimalLike;
  trialingSubscriptions: number;
  activeSubscriptions: number;
  monthStart: string;
  monthEnd: string;
};

export type InvoiceDetails = {
  invoice: InvoiceSummary;
  items: InvoiceItem[];
  paymentAttempts: PaymentAttempt[];
  cycle: (BillingCycleRecord & { usageSnapshots?: BillingUsageSnapshot[] }) | null;
  snapshot: BillingUsageSnapshot | null;
  subscription: TenantBillingSubscription & { billingPlan: BillingPlanV2 };
  plan: BillingPlanV2;
  tier: BillingRevenueTier | null;
};

export type CurrentCycleBody = {
  tenantId: string;
  subscriptionId: string;
  now?: string;
};

export type CloseAndDraftInvoiceBody = {
  tenantId: string;
  subscriptionId: string;
  planId: string;
};

export type UsagePreviewParams = {
  tenantId: string;
  periodStart: string;
  periodEnd: string;
  planId?: string;
};

export type PreviewCycleInvoiceParams = {
  tenantId: string;
  subscriptionId: string;
  planId: string;
};

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

export const adminBillingApi = {
  listTenants: async () => {
    const res = await api.get<PaginatedTenants>('/admin/tenants?pageSize=100');
    return res.data;
  },
  listBillingPlansV2: async () => {
    const res = await api.get<BillingPlanV2[]>('/admin/billing/plans-v2');
    return res.data;
  },
  updateBillingPlanV2: async (planId: string, body: UpdateBillingPlanV2Body) => {
    const res = await api.put<BillingPlanV2>(`/admin/billing/plans-v2/${planId}`, body);
    return res.data;
  },
  getBillingOverview: async () => {
    const res = await api.get<BillingOverview>('/admin/billing/overview');
    return res.data;
  },
  getBillingSettings: async () => {
    const res = await api.get<BillingSettings>('/admin/billing/settings');
    return res.data;
  },
  updateBillingSettings: async (body: UpdateBillingSettingsBody) => {
    const res = await api.put<BillingSettings>('/admin/billing/settings', body);
    return res.data;
  },
  getBillingPaymentConfig: async () => {
    const res = await api.get<BillingPaymentConfig>('/admin/billing/payment-config');
    return res.data;
  },
  getTenantBillingSubscription: async (tenantId: string) => {
    const res = await api.get<TenantBillingSubscriptionResponse>(`/admin/billing/tenants/${tenantId}/subscription`);
    return res.data;
  },
  getTenantBillingCycles: async (tenantId: string) => {
    const res = await api.get<BillingCycleRecord[]>(`/admin/billing/tenants/${tenantId}/cycles`);
    return res.data;
  },
  getTenantBillingInvoices: async (tenantId: string) => {
    const res = await api.get<InvoiceSummary[]>(`/admin/billing/tenants/${tenantId}/invoices`);
    return res.data;
  },
  listDraftInvoices: async () => {
    const res = await api.get<InvoiceSummary[]>('/admin/billing/invoices?status=draft');
    return res.data;
  },
  getInvoiceDetails: async (invoiceId: string) => {
    const res = await api.get<InvoiceDetails>(`/admin/billing/invoices/${invoiceId}`);
    return res.data;
  },
  listInvoicePaymentAttempts: async (invoiceId: string) => {
    const res = await api.get<PaymentAttempt[]>(`/admin/billing/invoices/${invoiceId}/payment-attempts`);
    return res.data;
  },
  createInvoicePaymentAttempt: async (
    invoiceId: string,
    body: {
      provider: 'manual' | 'mock' | 'asaas';
      mode: 'manual' | 'sandbox' | 'production';
      idempotencyKey?: string;
      simulate?: 'success' | 'failure' | 'pending';
    },
  ) => {
    const res = await api.post<PaymentAttempt>(`/admin/billing/invoices/${invoiceId}/payment-attempts`, body);
    return res.data;
  },
  markPaymentAttemptPaid: async (attemptId: string) => {
    const res = await api.post<PaymentAttempt>(`/admin/billing/payment-attempts/${attemptId}/mark-paid`, {
      reason: 'admin_billing_console',
    });
    return res.data;
  },
  markPaymentAttemptFailed: async (attemptId: string) => {
    const res = await api.post<PaymentAttempt>(`/admin/billing/payment-attempts/${attemptId}/mark-failed`, {
      errorCode: 'admin_console_failure',
      errorMessage: 'Marcado como falha pelo console admin.',
    });
    return res.data;
  },
  getUsagePreview: async (params: UsagePreviewParams) => {
    const res = await api.get<BillingUsagePreview>(`/admin/billing/usage-preview${buildQuery(params)}`);
    return res.data;
  },
  getOrCreateCurrentCycle: async (body: CurrentCycleBody) => {
    const res = await api.post<BillingCycleRecord>('/admin/billing/cycles/current', body);
    return res.data;
  },
  previewCycleInvoice: async (cycleId: string, params: PreviewCycleInvoiceParams) => {
    const res = await api.get<BillingCycleInvoicePreview>(
      `/admin/billing/cycles/${cycleId}/preview-invoice${buildQuery(params)}`,
    );
    return res.data;
  },
  closeAndDraftInvoice: async (cycleId: string, body: CloseAndDraftInvoiceBody) => {
    const res = await api.post<{ cycle: BillingCycleRecord; invoice: InvoiceSummary; usageSnapshotId: string }>(
      `/admin/billing/cycles/${cycleId}/close-and-draft-invoice`,
      body,
    );
    return res.data;
  },
};
