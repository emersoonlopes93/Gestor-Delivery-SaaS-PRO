const fs = require('fs');
const path = require('path');

const srcDir = 'apps/web-admin/src';
const billingDir = path.join(srcDir, 'features/billing');
const compDir = path.join(billingDir, 'components');
const hookDir = path.join(billingDir, 'hooks');

// 1. Fix BillingConsolePage named export
let consolePage = fs.readFileSync(path.join(billingDir, 'BillingConsolePage.tsx'), 'utf8');
consolePage = consolePage.replace('export default function BillingConsolePage', 'export function BillingConsolePage');
fs.writeFileSync(path.join(billingDir, 'BillingConsolePage.tsx'), consolePage);

// 2. Export CloseCycleModal and InvoiceItemsTable
let subsTab = fs.readFileSync(path.join(compDir, 'BillingSubscriptionsTab.tsx'), 'utf8');
subsTab = subsTab.replace('function CloseCycleModal', 'export function CloseCycleModal');
fs.writeFileSync(path.join(compDir, 'BillingSubscriptionsTab.tsx'), subsTab);

let invTab = fs.readFileSync(path.join(compDir, 'BillingInvoicesTab.tsx'), 'utf8');
invTab = invTab.replace('function InvoiceItemsTable', 'export function InvoiceItemsTable');
fs.writeFileSync(path.join(compDir, 'BillingInvoicesTab.tsx'), invTab);

// 3. Fix duplicate imports and TS2459 (locally declared not exported) in all files
function fixImports(file) {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');
  
  // Clean duplicate imports
  let lines = content.split('\n');
  let importLines = lines.filter(l => l.startsWith('import '));
  let otherLines = lines.filter(l => !l.startsWith('import '));
  
  // Re-build clean imports
  // Just use regex to fix duplicate words inside import { ... }
  for (let i = 0; i < importLines.length; i++) {
    let match = importLines[i].match(/import {([^}]+)}/);
    if (match) {
      let tokens = match[1].split(',').map(t => t.trim()).filter(Boolean);
      let uniqueTokens = [...new Set(tokens)];
      importLines[i] = importLines[i].replace(match[1], ' ' + uniqueTokens.join(', ') + ' ');
    }
  }
  
  // Dedup identical import lines
  importLines = [...new Set(importLines)];
  
  fs.writeFileSync(file, importLines.join('\n') + '\n' + otherLines.join('\n'));
}

const comps = fs.readdirSync(compDir);
for (let c of comps) fixImports(path.join(compDir, c));
fixImports(path.join(hookDir, 'useBillingConsole.ts'));

// 4. Fix types.ts
// I'll just rewrite it clean.
const typesTsClean = `import { CreditCard, TrendingUp, Layers3, Store, Receipt, ClipboardList, Settings } from 'lucide-react';
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
`;
fs.writeFileSync(path.join(billingDir, 'types.ts'), typesTsClean);

// 5. Fix BillingSafetyNotice.tsx leftover error TS2304: Cannot find name 'BillingTierForm'.
// It seems there's still a reference. Wait, line 29 of SafetyNotice! No, the error is probably from before I cleaned it or it's still there.
let safety = fs.readFileSync(path.join(compDir, 'BillingSafetyNotice.tsx'), 'utf8');
safety = safety.replace(/type BillingTierForm = .*;/g, '');
safety = safety.replace(/type BillingPlanFormState = \{[\s\S]*?\};/g, '');
fs.writeFileSync(path.join(compDir, 'BillingSafetyNotice.tsx'), safety);

// 6. useBillingConsole.ts: Cannot find name 'InvoiceSummary'
let hookTs = fs.readFileSync(path.join(hookDir, 'useBillingConsole.ts'), 'utf8');
if (!hookTs.includes('InvoiceSummary')) {
  hookTs = hookTs.replace(/BillingPlanFormState } from '\.\.\/admin-billing-api';/, "BillingPlanFormState, InvoiceSummary } from '../admin-billing-api';");
}
fs.writeFileSync(path.join(hookDir, 'useBillingConsole.ts'), hookTs);

// 7. Fix implicit any in BillingPlansTab.tsx
let plansTab = fs.readFileSync(path.join(compDir, 'BillingPlansTab.tsx'), 'utf8');
// Fix current => (current: BillingPlanFormState)
plansTab = plansTab.replace(/setForm\(\(current\) =>/g, 'setForm((current: BillingPlanFormState) =>');
// Fix tier => (tier: BillingTierForm)
plansTab = plansTab.replace(/\(tier\) =>/g, '(tier: BillingTierForm) =>');
plansTab = plansTab.replace(/\(tier, index\) =>/g, '(tier: BillingTierForm, index: number) =>');
fs.writeFileSync(path.join(compDir, 'BillingPlansTab.tsx'), plansTab);

// 8. Fix TenantDetailsPage.tsx
let tenantPage = fs.readFileSync(path.join(srcDir, 'features/tenants/TenantDetailsPage.tsx'), 'utf8');
// It says property items does not exist on type { success: boolean; data: { items: ActivityItem[] } }
tenantPage = tenantPage.replace(/data\.items/g, 'data.data.items');
fs.writeFileSync(path.join(srcDir, 'features/tenants/TenantDetailsPage.tsx'), tenantPage);

console.log('Fixed phase 2');
