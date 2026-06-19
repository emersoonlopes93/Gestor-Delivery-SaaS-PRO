import { useEffect, useState } from 'react';
import { Loader2, Save, Settings } from 'lucide-react';
import { BillingSettings, UpdateBillingSettingsBody } from '../admin-billing-api';
import { Panel, EmptyState, LoadingBlock, ToggleField, NumberField } from './BillingShared';

function settingsToForm(settings: BillingSettings): UpdateBillingSettingsBody {
  return {
    freeTierRevenueLimit: settings.freeTierRevenueLimit,
    maxMonthlyCharge: settings.maxMonthlyCharge,
    trialProEnabled: settings.trialProEnabled,
    trialProDays: settings.trialProDays,
    trialRequiresPaymentMethod: settings.trialRequiresPaymentMethod,
    trialIncludesAi: settings.trialIncludesAi,
    trialIncludesIfood: settings.trialIncludesIfood,
    trialIncludesAdvancedReports: settings.trialIncludesAdvancedReports,
    trialAutoConvertToBilling: settings.trialAutoConvertToBilling,
    aiAddonEnabled: settings.aiAddonEnabled,
    aiAddonPrice: settings.aiAddonPrice,
    aiFreeTrialMessages: settings.aiFreeTrialMessages,
    aiIncludedForPaidTenants: settings.aiIncludedForPaidTenants,
    aiIncludedMonthlyMessages: settings.aiIncludedMonthlyMessages,
    aiHardLimitMonthlyMessages: settings.aiHardLimitMonthlyMessages,
    countMarketplaceOrdersDefault: settings.countMarketplaceOrdersDefault,
    includeDeliveryFeeByDefault: settings.includeDeliveryFeeByDefault,
    includeServiceFeeByDefault: settings.includeServiceFeeByDefault,
    countStorefrontOrders: settings.countStorefrontOrders,
    countDirectOnlineOrders: settings.countDirectOnlineOrders,
    countPosOrders: settings.countPosOrders,
    countWhatsappAiOrders: settings.countWhatsappAiOrders,
    countManualOrders: settings.countManualOrders,
    countMarketplaceIfoodOrders: settings.countMarketplaceIfoodOrders,
    countConfirmedOrders: settings.countConfirmedOrders,
    countCompletedOrders: settings.countCompletedOrders,
    excludeCancelledOrders: settings.excludeCancelledOrders,
    discountReducesRevenue: settings.discountReducesRevenue,
    defaultGracePeriodDays: settings.defaultGracePeriodDays,
    defaultTrialDays: settings.defaultTrialDays,
    requirePaymentMethodForPaidPlans: settings.requirePaymentMethodForPaidPlans,
    partnerLinksJson: settings.partnerLinksJson ?? [],
  };
}

export function SettingsTab(props: {
  settings?: BillingSettings;
  loading: boolean;
  saving: boolean;
  onSave: (body: UpdateBillingSettingsBody) => void;
}) {
  const { settings, loading, saving, onSave } = props;
  const [form, setForm] = useState<UpdateBillingSettingsBody | null>(settings ? settingsToForm(settings) : null);
  const [partnerLinksText, setPartnerLinksText] = useState(settings?.partnerLinksJson ? JSON.stringify(settings.partnerLinksJson, null, 2) : '[]');

  useEffect(() => {
    setForm(settings ? settingsToForm(settings) : null);
    setPartnerLinksText(settings?.partnerLinksJson ? JSON.stringify(settings.partnerLinksJson, null, 2) : '[]');
  }, [settings]);

  if (loading) return <LoadingBlock />;
  if (!settings || !form) return <EmptyState icon={Settings} title="Configuracoes indisponiveis" text="Nao foi possivel carregar BillingSettings global." />;

  const setBoolean = (key: keyof UpdateBillingSettingsBody, value: boolean) => {
    setForm((current) => current ? { ...current, [key]: value } : current);
  };

  const setNumber = (key: keyof UpdateBillingSettingsBody, value: number) => {
    setForm((current) => current ? { ...current, [key]: value } : current);
  };

  const save = () => {
    try {
      onSave({
        ...form,
        partnerLinksJson: JSON.parse(partnerLinksText),
      });
    } catch {
      alert('O JSON dos links de parceiros precisa ser valido.');
    }
  };

  return (
    <Panel
      title="Configuracoes de Monetizacao"
      action={(
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-black text-primary-foreground disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar configuracoes
        </button>
      )}
    >
      <div className="border-b border-border px-5 py-4 text-sm font-medium text-muted-foreground">
        O limite gratuito e o teto mensal continuam derivados das faixas do plano de faturamento. Enquanto o gateway de cartao nao estiver 100% operacional, mantenha o Trial Pro como ativacao assistida e a auto-conversao desabilitada.
      </div>
      <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
        <NumberField label="Limite gratuito" value={Number(form.freeTierRevenueLimit ?? 0)} onChange={(value) => setNumber('freeTierRevenueLimit', value)} />
        <NumberField label="Teto mensal" value={Number(form.maxMonthlyCharge ?? 0)} onChange={(value) => setNumber('maxMonthlyCharge', value)} />
        <ToggleField label="Trial Pro habilitado" checked={!!form.trialProEnabled} onChange={(value) => setBoolean('trialProEnabled', value)} />
        <NumberField label="Dias do Trial Pro" value={Number(form.trialProDays ?? 0)} onChange={(value) => setNumber('trialProDays', value)} />
        <ToggleField label="Trial exige cartao" checked={!!form.trialRequiresPaymentMethod} onChange={(value) => setBoolean('trialRequiresPaymentMethod', value)} />
        <ToggleField label="Trial inclui IA" checked={!!form.trialIncludesAi} onChange={(value) => setBoolean('trialIncludesAi', value)} />
        <ToggleField label="Trial inclui iFood" checked={!!form.trialIncludesIfood} onChange={(value) => setBoolean('trialIncludesIfood', value)} />
        <ToggleField label="Trial inclui relatorios avancados" checked={!!form.trialIncludesAdvancedReports} onChange={(value) => setBoolean('trialIncludesAdvancedReports', value)} />
        <ToggleField label="Trial auto converte" checked={!!form.trialAutoConvertToBilling} onChange={(value) => setBoolean('trialAutoConvertToBilling', value)} />
        <ToggleField label="Add-on IA habilitado" checked={!!form.aiAddonEnabled} onChange={(value) => setBoolean('aiAddonEnabled', value)} />
        <NumberField label="Preco add-on IA" value={Number(form.aiAddonPrice ?? 0)} onChange={(value) => setNumber('aiAddonPrice', value)} />
        <NumberField label="Cota IA free" value={Number(form.aiFreeTrialMessages ?? 0)} onChange={(value) => setNumber('aiFreeTrialMessages', value)} />
        <ToggleField label="IA inclusa para pagantes" checked={!!form.aiIncludedForPaidTenants} onChange={(value) => setBoolean('aiIncludedForPaidTenants', value)} />
        <NumberField label="Cota IA pagantes" value={Number(form.aiIncludedMonthlyMessages ?? 0)} onChange={(value) => setNumber('aiIncludedMonthlyMessages', value)} />
        <NumberField label="Limite duro IA" value={Number(form.aiHardLimitMonthlyMessages ?? 0)} onChange={(value) => setNumber('aiHardLimitMonthlyMessages', value)} />
        <ToggleField label="Marketplace por padrao" checked={!!form.countMarketplaceOrdersDefault} onChange={(value) => setBoolean('countMarketplaceOrdersDefault', value)} />
        <ToggleField label="iFood conta no billing" checked={!!form.countMarketplaceIfoodOrders} onChange={(value) => setBoolean('countMarketplaceIfoodOrders', value)} />
        <ToggleField label="Contar Storefront" checked={form.countStorefrontOrders} onChange={(value) => setBoolean('countStorefrontOrders', value)} />
        <ToggleField label="Contar direct online" checked={form.countDirectOnlineOrders} onChange={(value) => setBoolean('countDirectOnlineOrders', value)} />
        <ToggleField label="Contar PDV" checked={form.countPosOrders} onChange={(value) => setBoolean('countPosOrders', value)} />
        <ToggleField label="Contar WhatsApp IA" checked={form.countWhatsappAiOrders} onChange={(value) => setBoolean('countWhatsappAiOrders', value)} />
        <ToggleField label="Contar pedidos manuais" checked={form.countManualOrders} onChange={(value) => setBoolean('countManualOrders', value)} />
        <ToggleField label="Contar confirmados" checked={form.countConfirmedOrders} onChange={(value) => setBoolean('countConfirmedOrders', value)} />
        <ToggleField label="Contar concluidos" checked={form.countCompletedOrders} onChange={(value) => setBoolean('countCompletedOrders', value)} />
        <ToggleField label="Excluir cancelados" checked={form.excludeCancelledOrders} onChange={(value) => setBoolean('excludeCancelledOrders', value)} />
        <ToggleField label="Desconto reduz receita" checked={form.discountReducesRevenue} onChange={(value) => setBoolean('discountReducesRevenue', value)} />
        <ToggleField label="Incluir entrega" checked={form.includeDeliveryFeeByDefault} onChange={(value) => setBoolean('includeDeliveryFeeByDefault', value)} />
        <ToggleField label="Incluir taxa de servico" checked={form.includeServiceFeeByDefault} onChange={(value) => setBoolean('includeServiceFeeByDefault', value)} />
        <ToggleField label="Exigir metodo em planos pagos" checked={form.requirePaymentMethodForPaidPlans} onChange={(value) => setBoolean('requirePaymentMethodForPaidPlans', value)} />
        <NumberField label="Trial padrao legado" value={form.defaultTrialDays} onChange={(value) => setNumber('defaultTrialDays', value)} />
        <NumberField label="Carencia padrao" value={form.defaultGracePeriodDays} onChange={(value) => setNumber('defaultGracePeriodDays', value)} />
      </div>
      <div className="border-t border-border p-5">
        <p className="mb-2 text-xs font-black uppercase tracking-widest text-muted-foreground">Links de parceiros (JSON)</p>
        <textarea
          value={partnerLinksText}
          onChange={(event) => setPartnerLinksText(event.target.value)}
          className="min-h-48 w-full rounded-md border border-border bg-background p-3 text-sm text-foreground"
        />
      </div>
    </Panel>
  );
}
