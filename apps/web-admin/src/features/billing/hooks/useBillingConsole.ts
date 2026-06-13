import { adminBillingApi, type BillingUsagePreview, type BillingCycleInvoicePreview, type InvoiceSummary } from '../admin-billing-api';
import { TabId, BillingPlanFormState } from '../types';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export function useBillingConsole() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [usagePreview, setUsagePreview] = useState<BillingUsagePreview | undefined>();
  const [invoicePreview, setInvoicePreview] = useState<BillingCycleInvoicePreview | undefined>();
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');

  const tenantsQuery = useQuery({ queryKey: ['admin-tenants-billing'], queryFn: adminBillingApi.listTenants });
  const overviewQuery = useQuery({ queryKey: ['admin-billing-overview'], queryFn: adminBillingApi.getBillingOverview });
  const plansQuery = useQuery({ queryKey: ['admin-billing-plans-v2'], queryFn: adminBillingApi.listBillingPlansV2 });
  const settingsQuery = useQuery({ queryKey: ['admin-billing-settings'], queryFn: adminBillingApi.getBillingSettings });
  const paymentConfigQuery = useQuery({ queryKey: ['admin-billing-payment-config'], queryFn: adminBillingApi.getBillingPaymentConfig });
  const draftInvoicesQuery = useQuery({ queryKey: ['admin-billing-draft-invoices'], queryFn: adminBillingApi.listDraftInvoices });

  const tenantBillingQuery = useQuery({
    queryKey: ['admin-tenant-billing', selectedTenantId],
    queryFn: () => adminBillingApi.getTenantBillingSubscription(selectedTenantId),
    enabled: !!selectedTenantId,
  });
  const tenantCyclesQuery = useQuery({
    queryKey: ['admin-tenant-billing-cycles', selectedTenantId],
    queryFn: () => adminBillingApi.getTenantBillingCycles(selectedTenantId),
    enabled: !!selectedTenantId,
  });
  const tenantInvoicesQuery = useQuery({
    queryKey: ['admin-tenant-billing-invoices', selectedTenantId],
    queryFn: () => adminBillingApi.getTenantBillingInvoices(selectedTenantId),
    enabled: !!selectedTenantId,
  });
  const revenueEventsQuery = useQuery({
    queryKey: ['admin-billing-revenue-events', selectedTenantId],
    queryFn: () => adminBillingApi.listRevenueEvents(selectedTenantId),
    enabled: !!selectedTenantId,
  });
  const usageSnapshotsQuery = useQuery({
    queryKey: ['admin-billing-usage-snapshots', selectedTenantId],
    queryFn: () => adminBillingApi.listUsageSnapshots(selectedTenantId),
    enabled: !!selectedTenantId,
  });
  const subscriptionHistoryQuery = useQuery({
    queryKey: ['admin-billing-subscription-history', selectedTenantId],
    queryFn: () => adminBillingApi.listSubscriptionStatusHistory(selectedTenantId),
    enabled: !!selectedTenantId,
  });
  const invoiceDetailsQuery = useQuery({
    queryKey: ['admin-billing-invoice-details', selectedInvoiceId],
    queryFn: () => adminBillingApi.getInvoiceDetails(selectedInvoiceId),
    enabled: !!selectedInvoiceId,
  });

  const selectedTenantBilling = tenantBillingQuery.data;
  const selectedSubscription = selectedTenantBilling?.subscription ?? null;
  const selectedPlan = selectedTenantBilling?.plan ?? null;
  const selectedCycle = selectedTenantBilling?.currentCycle ?? tenantCyclesQuery.data?.[0] ?? null;

  const refreshTenantBilling = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-billing', selectedTenantId] }),
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-billing-cycles', selectedTenantId] }),
      queryClient.invalidateQueries({ queryKey: ['admin-tenant-billing-invoices', selectedTenantId] }),
      queryClient.invalidateQueries({ queryKey: ['admin-billing-revenue-events', selectedTenantId] }),
      queryClient.invalidateQueries({ queryKey: ['admin-billing-usage-snapshots', selectedTenantId] }),
      queryClient.invalidateQueries({ queryKey: ['admin-billing-subscription-history', selectedTenantId] }),
      queryClient.invalidateQueries({ queryKey: ['admin-billing-overview'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-billing-draft-invoices'] }),
    ]);
  };

  const createCycleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTenantId || !selectedSubscription) throw new Error('Selecione tenant com assinatura billing.');
      return adminBillingApi.getOrCreateCurrentCycle({
        tenantId: selectedTenantId,
        subscriptionId: selectedSubscription.id,
      });
    },
    onSuccess: () => {
      setUsagePreview(undefined);
      setInvoicePreview(undefined);
      void refreshTenantBilling();
    },
  });

  const usagePreviewMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTenantId || !selectedCycle) throw new Error('Crie ou selecione um ciclo.');
      return adminBillingApi.getUsagePreview({
        tenantId: selectedTenantId,
        periodStart: selectedCycle.startedAt,
        periodEnd: selectedCycle.endedAt ?? new Date().toISOString(),
        planId: selectedPlan?.id,
      });
    },
    onSuccess: setUsagePreview,
  });

  const invoicePreviewMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTenantId || !selectedSubscription || !selectedPlan || !selectedCycle) {
        throw new Error('Tenant, assinatura, plano e ciclo são obrigatórios.');
      }
      return adminBillingApi.previewCycleInvoice(selectedCycle.id, {
        tenantId: selectedTenantId,
        subscriptionId: selectedSubscription.id,
        planId: selectedPlan.id,
      });
    },
    onSuccess: setInvoicePreview,
  });

  const closeCycleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTenantId || !selectedSubscription || !selectedPlan || !selectedCycle) {
        throw new Error('Tenant, assinatura, plano e ciclo são obrigatórios.');
      }
      return adminBillingApi.closeAndDraftInvoice(selectedCycle.id, {
        tenantId: selectedTenantId,
        subscriptionId: selectedSubscription.id,
        planId: selectedPlan.id,
      });
    },
    onSuccess: async () => {
      setCloseModalOpen(false);
      setInvoicePreview(undefined);
      await refreshTenantBilling();
      if (selectedCycle && selectedPlan && selectedSubscription) {
        const preview = await adminBillingApi.previewCycleInvoice(selectedCycle.id, {
          tenantId: selectedTenantId,
          subscriptionId: selectedSubscription.id,
          planId: selectedPlan.id,
        });
        setInvoicePreview(preview);
      }
    },
  });

  const createSubscriptionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTenantId) throw new Error('Selecione um tenant.');
      return adminBillingApi.createTenantBillingSubscription(selectedTenantId);
    },
    onSuccess: async () => {
      setUsagePreview(undefined);
      setInvoicePreview(undefined);
      await refreshTenantBilling();
    },
  });

  const refreshInvoiceDetails = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-billing-invoice-details', selectedInvoiceId] }),
      queryClient.invalidateQueries({ queryKey: ['admin-billing-draft-invoices'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-billing-overview'] }),
    ]);
  };

  const createPaymentAttemptMutation = useMutation({
    mutationFn: async (invoice: InvoiceSummary) => {
      const config = paymentConfigQuery.data;
      if (!config?.paymentsEnabled) throw new Error('Payments estao desativados.');
      if (config.provider !== 'manual' && config.provider !== 'mock' && config.provider !== 'asaas') throw new Error('Provider não suportado nesta fase.');
      if (config.mode !== 'manual' && config.mode !== 'sandbox' && config.mode !== 'production') throw new Error('Modo de gateway inválido.');
      return adminBillingApi.createInvoicePaymentAttempt(invoice.id, {
        provider: config.provider,
        mode: config.mode,
        idempotencyKey: `admin-console:${invoice.id}:${config.provider}:${config.mode}`,
        simulate: config.provider === 'mock' ? 'pending' : undefined,
      });
    },
    onSuccess: () => {
      void refreshInvoiceDetails();
    },
  });

  const markPaymentAttemptPaidMutation = useMutation({
    mutationFn: adminBillingApi.markPaymentAttemptPaid,
    onSuccess: () => {
      void refreshInvoiceDetails();
    },
  });

  const markPaymentAttemptFailedMutation = useMutation({
    mutationFn: adminBillingApi.markPaymentAttemptFailed,
    onSuccess: () => {
      void refreshInvoiceDetails();
    },
  });

  const updatePlanMutation = useMutation({
    mutationFn: ({ planId, form }: { planId: string; form: BillingPlanFormState }) => adminBillingApi.updateBillingPlanV2(planId, {
      name: form.name,
      description: form.description.trim() ? form.description.trim() : null,
      trialDays: form.trialDays,
      requiresPaymentMethod: form.requiresPaymentMethod,
      allowAllModules: form.allowAllModules,
      isActive: form.isActive,
      isPublic: form.isPublic,
      tiers: form.tiers.map((tier) => ({
        ...(tier.id ? { id: tier.id } : {}),
        minRevenue: tier.minRevenue,
        maxRevenue: tier.maxRevenue === '' ? null : tier.maxRevenue,
        price: tier.price,
        label: typeof tier.label === 'string' && tier.label.trim() ? tier.label.trim() : null,
      })),
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-billing-plans-v2'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-billing-overview'] }),
      ]);
    },
  });

  const updateSettingsMutation = useMutation({
    mutationFn: adminBillingApi.updateBillingSettings,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-billing-settings'] });
    },
  });

  const tenants = tenantsQuery.data?.items ?? [];
  const revenueGrowthPlans = useMemo(() => {
    const plans = plansQuery.data ?? [];
    return plans.filter((plan) => plan.slug === 'revenue-growth');
  }, [plansQuery.data]);

  return {
    activeTab, setActiveTab,
    selectedTenantId, setSelectedTenantId,
    usagePreview, setUsagePreview,
    invoicePreview, setInvoicePreview,
    selectedInvoiceId, setSelectedInvoiceId,
    closeModalOpen, setCloseModalOpen,
    overviewQuery, plansQuery, tenantsQuery, tenantBillingQuery,
    tenantCyclesQuery, tenantInvoicesQuery, draftInvoicesQuery,
    invoiceDetailsQuery, paymentConfigQuery, revenueEventsQuery,
    usageSnapshotsQuery, subscriptionHistoryQuery, settingsQuery,
    createCycleMutation, closeCycleMutation, createSubscriptionMutation,
    usagePreviewMutation, invoicePreviewMutation, createPaymentAttemptMutation,
    markPaymentAttemptPaidMutation, markPaymentAttemptFailedMutation,
    updatePlanMutation, updateSettingsMutation,
    tenants, revenueGrowthPlans, selectedTenantBilling
  };
}
