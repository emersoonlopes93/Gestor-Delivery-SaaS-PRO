import { useState, useMemo, useEffect, useCallback } from 'react';
import { Loader2, Save, Settings } from 'lucide-react';
import { BillingSettings, UpdateBillingSettingsBody } from '../admin-billing-api';
import { Panel, EmptyState, LoadingBlock, ToggleField, NumberField } from './BillingShared';

function settingsToForm(settings: BillingSettings): UpdateBillingSettingsBody {
  return {
    includeDeliveryFeeByDefault: settings.includeDeliveryFeeByDefault,
    includeServiceFeeByDefault: settings.includeServiceFeeByDefault,
    countStorefrontOrders: settings.countStorefrontOrders,
    countPosOrders: settings.countPosOrders,
    countWhatsappAiOrders: settings.countWhatsappAiOrders,
    countManualOrders: settings.countManualOrders,
    countConfirmedOrders: settings.countConfirmedOrders,
    countCompletedOrders: settings.countCompletedOrders,
    excludeCancelledOrders: settings.excludeCancelledOrders,
    discountReducesRevenue: settings.discountReducesRevenue,
    defaultGracePeriodDays: settings.defaultGracePeriodDays,
    defaultTrialDays: settings.defaultTrialDays,
    requirePaymentMethodForPaidPlans: settings.requirePaymentMethodForPaidPlans,
  };
}


export function SettingsTab(props: {
  settings?: BillingSettings;
  loading: boolean;
  saving: boolean;
  onSave: (body: UpdateBillingSettingsBody) => void;
}) {
  const { settings, loading } = props;
  const [form, setForm] = useState<UpdateBillingSettingsBody | null>(settings ? settingsToForm(settings) : null);

  useEffect(() => {
    setForm(settings ? settingsToForm(settings) : null);
  }, [settings]);

  if (loading) return <LoadingBlock />;
  if (!settings || !form) return <EmptyState icon={Settings} title="Configurações indisponíveis" text="Não foi possível carregar BillingSettings global." />;

  const setBoolean = (key: keyof UpdateBillingSettingsBody, value: boolean) => {
    setForm((current) => current ? { ...current, [key]: value } : current);
  };
  const setNumber = (key: keyof UpdateBillingSettingsBody, value: number) => {
    setForm((current) => current ? { ...current, [key]: value } : current);
  };

  return (
    <Panel
      title="BillingSettings global"
      action={
        <button
          onClick={() => props.onSave(form)}
          disabled={props.saving}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-black text-primary-foreground disabled:opacity-60"
        >
          {props.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar configurações
        </button>
      }
    >
      <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
        <ToggleField label="Contar Storefront" checked={form.countStorefrontOrders} onChange={(value) => setBoolean('countStorefrontOrders', value)} />
        <ToggleField label="Contar PDV" checked={form.countPosOrders} onChange={(value) => setBoolean('countPosOrders', value)} />
        <ToggleField label="Contar WhatsApp IA" checked={form.countWhatsappAiOrders} onChange={(value) => setBoolean('countWhatsappAiOrders', value)} />
        <ToggleField label="Contar pedidos manuais" checked={form.countManualOrders} onChange={(value) => setBoolean('countManualOrders', value)} />
        <ToggleField label="Contar confirmados" checked={form.countConfirmedOrders} onChange={(value) => setBoolean('countConfirmedOrders', value)} />
        <ToggleField label="Contar concluídos" checked={form.countCompletedOrders} onChange={(value) => setBoolean('countCompletedOrders', value)} />
        <ToggleField label="Excluir cancelados" checked={form.excludeCancelledOrders} onChange={(value) => setBoolean('excludeCancelledOrders', value)} />
        <ToggleField label="Desconto reduz receita" checked={form.discountReducesRevenue} onChange={(value) => setBoolean('discountReducesRevenue', value)} />
        <ToggleField label="Incluir entrega" checked={form.includeDeliveryFeeByDefault} onChange={(value) => setBoolean('includeDeliveryFeeByDefault', value)} />
        <ToggleField label="Incluir taxa de serviço" checked={form.includeServiceFeeByDefault} onChange={(value) => setBoolean('includeServiceFeeByDefault', value)} />
        <ToggleField label="Exigir método em planos pagos" checked={form.requirePaymentMethodForPaidPlans} onChange={(value) => setBoolean('requirePaymentMethodForPaidPlans', value)} />
        <NumberField label="Trial padrão" value={form.defaultTrialDays} onChange={(value) => setNumber('defaultTrialDays', value)} />
        <NumberField label="Carência padrão" value={form.defaultGracePeriodDays} onChange={(value) => setNumber('defaultGracePeriodDays', value)} />
      </div>
    </Panel>
  );
}

