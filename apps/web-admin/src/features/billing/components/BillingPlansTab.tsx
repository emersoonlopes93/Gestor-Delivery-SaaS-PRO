import { BillingPlanV2 } from '../admin-billing-api';
import { BillingPlanFormState, BillingTierForm, shortId } from '../types';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { ArrowDown, ArrowUp, Layers3, Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { Panel, EmptyState, InfoPill, ToggleField, NumberField, MoneyInput, IconButton } from './BillingShared';

function planToForm(plan: BillingPlanV2): BillingPlanFormState {
  return {
    name: plan.name,
    description: plan.description ?? '',
    trialDays: plan.trialDays,
    requiresPaymentMethod: plan.requiresPaymentMethod,
    allowAllModules: plan.allowAllModules,
    isActive: plan.isActive,
    isPublic: plan.isPublic,
    tiers: plan.revenueTiers.map((tier: any) => ({
      rowId: tier.id || shortId(tier.id),
      id: tier.id,
      minRevenue: tier.minRevenue,
      maxRevenue: tier.maxRevenue,
      price: tier.price,
      label: tier.label,
    })),
  };
}


export function PlansTab(props: {
  plans: BillingPlanV2[];
  saving: boolean;
  onSave: (planId: string, form: BillingPlanFormState) => void;
}) {
  if (!props.plans.length) {
    return <EmptyState icon={Layers3} title="Nenhum plano billing v2 encontrado" text="Quando o plano revenue-growth existir, suas faixas aparecerão aqui com dados reais." />;
  }

  return (
    <div className="space-y-4">
      {props.plans.map((plan) => (
        <PlanEditor key={plan.id} plan={plan} saving={props.saving} onSave={props.onSave} />
      ))}
    </div>
  );
}


function PlanEditor(props: {
  plan: BillingPlanV2;
  saving: boolean;
  onSave: (planId: string, form: BillingPlanFormState) => void;
}) {
  const [form, setForm] = useState<BillingPlanFormState>(() => planToForm(props.plan));

  useEffect(() => {
    setForm(planToForm(props.plan));
  }, [props.plan]);

  const updateTier = (rowId: string, patch: Partial<BillingTierForm>) => {
    setForm((current: BillingPlanFormState) => ({
      ...current,
      tiers: current.tiers.map((tier: any) => (tier.rowId === rowId ? { ...tier, ...patch } : tier)),
    }));
  };

  const moveTier = (index: number, direction: -1 | 1) => {
    setForm((current: BillingPlanFormState) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.tiers.length) return current;
      const tiers = [...current.tiers];
      const [tier] = tiers.splice(index, 1);
      tiers.splice(nextIndex, 0, tier);
      return { ...current, tiers };
    });
  };

  const addTier = () => {
    setForm((current: BillingPlanFormState) => ({
      ...current,
      tiers: [
        ...current.tiers,
        {
          rowId: `new-${Date.now()}`,
          minRevenue: '0.00',
          maxRevenue: null,
          price: '0.00',
          label: '',
        },
      ],
    }));
  };

  const removeTier = (rowId: string) => {
    setForm((current: BillingPlanFormState) => ({
      ...current,
      tiers: current.tiers.filter((tier: BillingTierForm) => tier.rowId !== rowId),
    }));
  };

  return (
    <Panel
      title="Plano por faturamento"
      action={
        <button
          onClick={() => props.onSave(props.plan.id, form)}
          disabled={props.saving}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-black text-primary-foreground disabled:opacity-60"
        >
          {props.saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar plano
        </button>
      }
    >
      <div className="space-y-5 p-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_180px]">
          <label className="space-y-1">
            <span className="text-xs font-bold text-muted-foreground">Nome</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current: BillingPlanFormState) => ({ ...current, name: event.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <InfoPill label="Slug" value={props.plan.slug} />
        </div>
        <label className="space-y-1">
          <span className="text-xs font-bold text-muted-foreground">Descrição</span>
          <input
            value={form.description}
            onChange={(event) => setForm((current: BillingPlanFormState) => ({ ...current, description: event.target.value }))}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <div className="grid gap-3 md:grid-cols-5">
          <NumberField label="Trial em dias" value={form.trialDays} onChange={(trialDays) => setForm((current: BillingPlanFormState) => ({ ...current, trialDays }))} />
          <ToggleField label="Exigir método" checked={form.requiresPaymentMethod} onChange={(requiresPaymentMethod) => setForm((current: BillingPlanFormState) => ({ ...current, requiresPaymentMethod }))} />
          <ToggleField label="Todos módulos" checked={form.allowAllModules} onChange={(allowAllModules) => setForm((current: BillingPlanFormState) => ({ ...current, allowAllModules }))} />
          <ToggleField label="Ativo" checked={form.isActive} onChange={(isActive) => setForm((current: BillingPlanFormState) => ({ ...current, isActive }))} />
          <ToggleField label="Público" checked={form.isPublic} onChange={(isPublic) => setForm((current: BillingPlanFormState) => ({ ...current, isPublic }))} />
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-muted text-left text-xs font-black uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Ordem</th>
                <th className="px-4 py-3">Faixa</th>
                <th className="px-4 py-3">Mínimo</th>
                <th className="px-4 py-3">Máximo</th>
                <th className="px-4 py-3">Mensalidade</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {form.tiers.map((tier: BillingTierForm, index: number) => (
                <tr key={tier.rowId}>
                  <td className="px-4 py-3 font-black">{index + 1}</td>
                  <td className="px-4 py-3">
                    <input
                      value={tier.label ?? ''}
                      onChange={(event) => updateTier(tier.rowId, { label: event.target.value })}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 font-bold outline-none focus:ring-2 focus:ring-ring"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <MoneyInput value={tier.minRevenue} onChange={(minRevenue) => updateTier(tier.rowId, { minRevenue })} />
                  </td>
                  <td className="px-4 py-3">
                    <MoneyInput value={tier.maxRevenue ?? ''} placeholder="Sem limite" onChange={(maxRevenue) => updateTier(tier.rowId, { maxRevenue: maxRevenue === '' ? null : maxRevenue })} />
                  </td>
                  <td className="px-4 py-3">
                    <MoneyInput value={tier.price} onChange={(price) => updateTier(tier.rowId, { price })} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <IconButton label="Subir faixa" disabled={index === 0} onClick={() => moveTier(index, -1)} icon={ArrowUp} />
                      <IconButton label="Descer faixa" disabled={index === form.tiers.length - 1} onClick={() => moveTier(index, 1)} icon={ArrowDown} />
                      <IconButton label="Remover faixa" disabled={form.tiers.length === 1} onClick={() => removeTier(tier.rowId)} icon={Trash2} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          onClick={addTier}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-black text-foreground"
        >
          <Plus className="h-4 w-4" />
          Adicionar faixa
        </button>
      </div>
    </Panel>
  );
}

