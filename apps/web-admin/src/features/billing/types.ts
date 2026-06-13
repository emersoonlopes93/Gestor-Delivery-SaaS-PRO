import { CreditCard, TrendingUp, Layers3, Store, Receipt, ClipboardList, Settings } from 'lucide-react';
import { DecimalLike, BillingRevenueTierInput } from './admin-billing-api';

export type TabId = 'overview' | 'plans' | 'tenant' | 'invoices' | 'audit' | 'settings';

export const TABS: Array<{ id: TabId; label: string; icon: typeof CreditCard }> = [
  { id: 'overview', label: 'Visão Geral', icon: TrendingUp },
  { id: 'plans', label: 'Planos por Faturamento', icon: Layers3 },
  { id: 'tenant', label: 'Tenant Billing', icon: Store },
  { id: 'invoices', label: 'Invoices Draft', icon: Receipt },
  { id: 'audit', label: 'Auditoria', icon: ClipboardList },
  { id: 'settings', label: 'Configurações', icon: Settings },
];

export const statusLabels: Record<string, string> = {
  trialing: 'Trial',
  active: 'Ativo',
  draft: 'Rascunho',
  open: 'Aberto',
  closed: 'Fechado',
  invoiced: 'Faturado',
  paid: 'Pago',
  pending: 'Pendente',
  processing: 'Processando',
  succeeded: 'Sucesso',
  past_due: 'Em atraso',
  failed: 'Falhou',
  suspended: 'Suspenso',
  canceled: 'Cancelado',
  missing_new_billing_subscription: 'Sem billing novo',
  trial_expired_not_enforced: 'Trial expirado sem bloqueio',
  grace_period_expired_not_enforced: 'Carência expirada sem bloqueio',
};

export function money(value: DecimalLike | null | undefined, currency = 'BRL'): string {
  const numberValue = Number(value ?? 0);
  return numberValue.toLocaleString('pt-BR', { style: 'currency', currency });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('pt-BR');
}

export function shortId(value: string | null | undefined): string {
  return value ? value.slice(0, 8) : '—';
}

export function statusBadgeClass(status: string): string {
  if (['active', 'paid', 'invoiced'].includes(status)) return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400';
  if (['trialing', 'trial_expired_not_enforced'].includes(status)) return 'bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400';
  if (['past_due', 'suspended', 'failed'].includes(status)) return 'bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400';
  return 'bg-slate-500/10 text-slate-600 border-slate-500/20 dark:text-slate-400';
}

export function metadataText(metadata: Record<string, unknown> | null | undefined, key: string): string {
  if (!metadata) return '—';
  const val = metadata[key];
  if (val === undefined || val === null) return '—';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

export type BillingTierForm = BillingRevenueTierInput & { rowId: string };

export type BillingPlanFormState = {
  name: string;
  description: string;
  trialDays: number;
  requiresPaymentMethod: boolean;
  allowAllModules: boolean;
  isActive: boolean;
  isPublic: boolean;
  tiers: BillingTierForm[];
};
