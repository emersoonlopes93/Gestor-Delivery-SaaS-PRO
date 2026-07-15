import { CheckCircle2 } from 'lucide-react';
import { TABS } from './types';
import { SafetyAlert } from './components/BillingSafetyNotice';
import { OverviewTab } from './components/BillingOverviewTab';
import { PlansTab } from './components/BillingPlansTab';
import { TenantTab } from './components/BillingSubscriptionsTab';
import { InvoicesTab } from './components/BillingInvoicesTab';
import { BillingAuditTab } from './components/BillingAuditTab';
import { SettingsTab } from './components/BillingSettingsTab';
import { useBillingConsole } from './hooks/useBillingConsole';
import { CloseCycleModal } from './components/BillingSubscriptionsTab';

export function BillingConsolePage() {
  const state = useBillingConsole();
  const { activeTab, setActiveTab, selectedTenantId, setSelectedTenantId, usagePreview, setUsagePreview, invoicePreview, setInvoicePreview, setSelectedInvoiceId, closeModalOpen, setCloseModalOpen, overviewQuery, tenantBillingQuery, tenantCyclesQuery, tenantInvoicesQuery, draftInvoicesQuery, invoiceDetailsQuery, paymentConfigQuery, revenueEventsQuery, usageSnapshotsQuery, subscriptionHistoryQuery, settingsQuery, createCycleMutation, closeCycleMutation, createSubscriptionMutation, usagePreviewMutation, invoicePreviewMutation, createPaymentAttemptMutation, markPaymentAttemptPaidMutation, markPaymentAttemptFailedMutation, updatePlanMutation, updateSettingsMutation, tenants, revenueGrowthPlans, selectedTenantBilling } = state;

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-2 text-sm font-black uppercase tracking-widest text-primary">Billing Phase 5.5</p>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Console SaaS Admin de Billing</h1>
          <p className="mt-2 max-w-3xl text-base font-semibold text-muted-foreground">
            Visualize planos por faturamento, audite usage, feche ciclos manualmente e gere invoices draft sem ativar cobrança real.
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-xs font-bold text-muted-foreground">Estado da fase</p>
          <p className="mt-1 flex items-center gap-2 font-black text-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Manual/sandbox, auditável e sem gateway
          </p>
        </div>
      </div>

      <SafetyAlert />

      <div className="flex gap-2 overflow-x-auto rounded-lg border border-border bg-card p-2">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-black transition-colors ${
                active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' ? <OverviewTab overview={overviewQuery.data} loading={overviewQuery.isLoading} /> : null}
      {activeTab === 'plans' ? (
        <PlansTab
          plans={revenueGrowthPlans}
          saving={updatePlanMutation.isPending}
          onSave={(planId, form) => updatePlanMutation.mutate({ planId, form })}
        />
      ) : null}
      {activeTab === 'tenant' ? (
        <TenantTab
          tenants={tenants}
          selectedTenantId={selectedTenantId}
          onSelectTenant={(tenantId) => {
            setSelectedTenantId(tenantId);
            setUsagePreview(undefined);
            setInvoicePreview(undefined);
          }}
          tenantBilling={selectedTenantBilling}
          cycles={tenantCyclesQuery.data ?? []}
          invoices={tenantInvoicesQuery.data ?? []}
          usagePreview={usagePreview}
          invoicePreview={invoicePreview}
          tenantLoading={tenantBillingQuery.isLoading || tenantCyclesQuery.isLoading || tenantInvoicesQuery.isLoading}
          usageLoading={usagePreviewMutation.isPending}
          invoicePreviewLoading={invoicePreviewMutation.isPending}
          onCreateCycle={() => createCycleMutation.mutate()}
          onRefreshUsage={() => usagePreviewMutation.mutate()}
          onPreviewInvoice={() => invoicePreviewMutation.mutate()}
          onOpenCloseModal={() => setCloseModalOpen(true)}
          onCreateSubscription={() => createSubscriptionMutation.mutate()}
          creatingCycle={createCycleMutation.isPending}
          closingCycle={closeCycleMutation.isPending}
          creatingSubscription={createSubscriptionMutation.isPending}
        />
      ) : null}
      {activeTab === 'invoices' ? (
        <InvoicesTab
          invoices={draftInvoicesQuery.data ?? []}
          loading={draftInvoicesQuery.isLoading}
          onOpenInvoice={setSelectedInvoiceId}
          selectedDetails={invoiceDetailsQuery.data}
          paymentConfig={paymentConfigQuery.data}
          detailsLoading={invoiceDetailsQuery.isLoading}
          onCloseDetails={() => setSelectedInvoiceId('')}
          onCreateAttempt={(invoice) => createPaymentAttemptMutation.mutate(invoice)}
          onMarkAttemptPaid={(attemptId) => markPaymentAttemptPaidMutation.mutate(attemptId)}
          onMarkAttemptFailed={(attemptId) => markPaymentAttemptFailedMutation.mutate(attemptId)}
          paymentActionLoading={
            createPaymentAttemptMutation.isPending
            || markPaymentAttemptPaidMutation.isPending
            || markPaymentAttemptFailedMutation.isPending
          }
        />
      ) : null}
      {activeTab === 'audit' ? (
        <BillingAuditTab
          tenants={tenants}
          selectedTenantId={selectedTenantId}
          onSelectTenant={setSelectedTenantId}
          revenueEvents={revenueEventsQuery.data ?? []}
          snapshots={usageSnapshotsQuery.data ?? []}
          subscriptionHistory={subscriptionHistoryQuery.data ?? []}
          loading={revenueEventsQuery.isLoading || usageSnapshotsQuery.isLoading || subscriptionHistoryQuery.isLoading}
        />
      ) : null}
      {activeTab === 'settings' ? (
        <SettingsTab
          settings={settingsQuery.data}
          loading={settingsQuery.isLoading}
          saving={updateSettingsMutation.isPending}
          onSave={(body) => updateSettingsMutation.mutate(body)}
        />
      ) : null}

      {(createCycleMutation.error || usagePreviewMutation.error || invoicePreviewMutation.error || closeCycleMutation.error || createSubscriptionMutation.error || createPaymentAttemptMutation.error || markPaymentAttemptPaidMutation.error || markPaymentAttemptFailedMutation.error || updatePlanMutation.error || updateSettingsMutation.error) ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 font-bold text-red-700">
          {(createCycleMutation.error ?? usagePreviewMutation.error ?? invoicePreviewMutation.error ?? closeCycleMutation.error ?? createSubscriptionMutation.error ?? createPaymentAttemptMutation.error ?? markPaymentAttemptPaidMutation.error ?? markPaymentAttemptFailedMutation.error ?? updatePlanMutation.error ?? updateSettingsMutation.error)?.message}
        </div>
      ) : null}

      <CloseCycleModal
        open={closeModalOpen}
        loading={closeCycleMutation.isPending}
        onConfirm={() => closeCycleMutation.mutate()}
        onCancel={() => setCloseModalOpen(false)}
      />
    </div>
  );
}



