const fs = require('fs');
const path = require('path');

const srcFile = 'apps/web-admin/src/features/billing/BillingConsolePage.tsx';
const outDir = 'apps/web-admin/src/features/billing';
const componentsDir = path.join(outDir, 'components');
const hooksDir = path.join(outDir, 'hooks');

if (!fs.existsSync(componentsDir)) fs.mkdirSync(componentsDir, { recursive: true });
if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });

const content = fs.readFileSync(srcFile, 'utf8');
const lines = content.split('\n');

function getLines(start, end) {
  // end is inclusive, 1-based
  return lines.slice(start - 1, end).join('\n');
}

const blocks = {
  types: getLines(52, 61),
  statusLabels: getLines(63, 81),
  money: getLines(83, 87),
  formatDate: getLines(88, 92),
  shortId: getLines(93, 96),
  statusBadgeClass: getLines(97, 104),
  metadataText: getLines(105, 111),
  StatusBadge: getLines(112, 119),
  Panel: getLines(120, 133),
  MetricCard: getLines(134, 146),
  EmptyState: getLines(147, 157),
  LoadingBlock: getLines(158, 165),
  SafetyAlert: getLines(166, 193),
  planToForm: getLines(194, 213),
  PlansTab: getLines(214, 231),
  PlanEditor: getLines(232, 381),
  InfoPill: getLines(382, 390),
  ToggleField: getLines(391, 404),
  NumberField: getLines(405, 419),
  MoneyInput: getLines(420, 431),
  IconButton: getLines(432, 447),
  OverviewTab: getLines(448, 481),
  TenantTab: getLines(482, 654),
  InvoiceItemsTable: getLines(655, 681),
  BillingAuditTab: getLines(682, 832),
  InvoicesTab: getLines(833, 927),
  InvoiceDetailsView: getLines(928, 968),
  PaymentAttemptPanel: getLines(969, 1082),
  settingsToForm: getLines(1083, 1100),
  SettingsTab: getLines(1101, 1156),
  CloseCycleModal: getLines(1157, 1185),
  BillingConsolePage: getLines(1186, lines.length)
};

// All available lucide icons in the original file:
const ALL_ICONS = [
  'AlertTriangle', 'ArrowDown', 'ArrowUp', 'BadgeDollarSign', 'CalendarClock',
  'CheckCircle2', 'ClipboardList', 'CreditCard', 'Eye', 'FileText', 'Layers3',
  'Loader2', 'Plus', 'Receipt', 'RefreshCw', 'Save', 'Search', 'Settings',
  'ShieldAlert', 'Store', 'TrendingUp', 'Trash2', 'X'
];

// All available API types/functions
const ALL_API = [
  'adminBillingApi', 'AdminTenantListItem', 'BillingCycleInvoicePreview',
  'BillingCycleRecord', 'BillingOverview', 'BillingPaymentConfig', 'BillingPlanV2',
  'BillingRevenueTierInput', 'BillingSettings', 'BillingUsageSnapshot',
  'BillingUsagePreview', 'DecimalLike', 'InvoiceDetails', 'InvoiceItem',
  'InvoiceSummary', 'PaymentAttempt', 'RevenueEvent', 'SubscriptionStatusHistory',
  'TenantBillingSubscriptionResponse', 'UpdateBillingSettingsBody'
];

const SHARED_FUNCS = ['money', 'formatDate', 'shortId', 'statusBadgeClass', 'metadataText'];

function getImportsFor(code) {
  const usedIcons = ALL_ICONS.filter(i => new RegExp(`\\b${i}\\b`).test(code));
  const usedApi = ALL_API.filter(i => new RegExp(`\\b${i}\\b`).test(code));
  const usedFuncs = SHARED_FUNCS.filter(i => new RegExp(`\\b${i}\\b`).test(code));
  
  let imports = '';
  if (code.includes('useState') || code.includes('useMemo') || code.includes('useEffect') || code.includes('useCallback')) {
    imports += `import { useState, useMemo, useEffect, useCallback } from 'react';\n`;
  }
  if (usedIcons.length > 0) {
    imports += `import { ${usedIcons.join(', ')} } from 'lucide-react';\n`;
  }
  if (usedApi.length > 0) {
    imports += `import { ${usedApi.join(', ')} } from '../admin-billing-api';\n`;
  }
  if (usedFuncs.length > 0) {
    imports += `import { ${usedFuncs.join(', ')} } from '../types';\n`;
  }
  if (code.includes('StatusBadge')) {
    imports += `import { StatusBadge } from './BillingStatusBadge';\n`;
  }
  
  // Custom shared components import
  const sharedComps = ['Panel', 'MetricCard', 'EmptyState', 'LoadingBlock', 'InfoPill', 'ToggleField', 'NumberField', 'MoneyInput', 'IconButton'];
  const usedShared = sharedComps.filter(c => new RegExp(`\\b${c}\\b`).test(code));
  if (usedShared.length > 0) {
    imports += `import { ${usedShared.join(', ')} } from './BillingShared';\n`;
  }

  // Common types
  if (code.includes('TabId') || code.includes('TABS') || code.includes('statusLabels')) {
    imports += `import { TabId, TABS, statusLabels } from '../types';\n`;
  }

  return imports;
}

// 1. Write types.ts
const typesTs = `import { CreditCard, TrendingUp, Layers3, Store, Receipt, ClipboardList, Settings } from 'lucide-react';
import { DecimalLike } from './admin-billing-api';

${blocks.types}

${blocks.statusLabels}

${blocks.money}

${blocks.formatDate}

${blocks.shortId}

${blocks.statusBadgeClass}

${blocks.metadataText}
`;
fs.writeFileSync(path.join(outDir, 'types.ts'), typesTs);

// 2. Write BillingStatusBadge.tsx
fs.writeFileSync(path.join(componentsDir, 'BillingStatusBadge.tsx'), 
  getImportsFor(blocks.StatusBadge) + '\nexport ' + blocks.StatusBadge + '\n');

// 3. Write BillingSafetyNotice.tsx
fs.writeFileSync(path.join(componentsDir, 'BillingSafetyNotice.tsx'), 
  getImportsFor(blocks.SafetyAlert) + '\nexport ' + blocks.SafetyAlert + '\n');

// 4. Write BillingShared.tsx
const sharedCode = [blocks.Panel, blocks.MetricCard, blocks.EmptyState, blocks.LoadingBlock, blocks.InfoPill, blocks.ToggleField, blocks.NumberField, blocks.MoneyInput, blocks.IconButton].join('\n\n');
fs.writeFileSync(path.join(componentsDir, 'BillingShared.tsx'), 
  getImportsFor(sharedCode) + '\n' + sharedCode.replace(/function /g, 'export function ') + '\n');

// 5. Write BillingOverviewTab.tsx
fs.writeFileSync(path.join(componentsDir, 'BillingOverviewTab.tsx'), 
  getImportsFor(blocks.OverviewTab) + '\nexport ' + blocks.OverviewTab + '\n');

// 6. Write BillingPlansTab.tsx
const plansCode = [blocks.planToForm, blocks.PlansTab, blocks.PlanEditor].join('\n\n');
fs.writeFileSync(path.join(componentsDir, 'BillingPlansTab.tsx'), 
  getImportsFor(plansCode) + '\n' + plansCode.replace('function PlansTab', 'export function PlansTab') + '\n');

// 7. Write BillingSubscriptionsTab.tsx
const subsCode = [blocks.TenantTab, blocks.CloseCycleModal].join('\n\n');
fs.writeFileSync(path.join(componentsDir, 'BillingSubscriptionsTab.tsx'), 
  getImportsFor(subsCode) + '\n' + subsCode.replace('function TenantTab', 'export function TenantTab') + '\n');

// 8. Write BillingInvoicesTab.tsx
const invoicesCode = [blocks.InvoiceItemsTable, blocks.InvoicesTab, blocks.InvoiceDetailsView, blocks.PaymentAttemptPanel].join('\n\n');
fs.writeFileSync(path.join(componentsDir, 'BillingInvoicesTab.tsx'), 
  getImportsFor(invoicesCode) + '\n' + invoicesCode.replace('function InvoicesTab', 'export function InvoicesTab') + '\n');

// 9. Write BillingAuditTab.tsx
fs.writeFileSync(path.join(componentsDir, 'BillingAuditTab.tsx'), 
  getImportsFor(blocks.BillingAuditTab) + '\nexport ' + blocks.BillingAuditTab + '\n');

// 10. Write BillingSettingsTab.tsx
const settingsCode = [blocks.settingsToForm, blocks.SettingsTab].join('\n\n');
fs.writeFileSync(path.join(componentsDir, 'BillingSettingsTab.tsx'), 
  getImportsFor(settingsCode) + '\n' + settingsCode.replace('function SettingsTab', 'export function SettingsTab') + '\n');

// 11. Write useBillingConsole.ts
// We will extract everything inside BillingConsolePage up to "return ("
const pageContent = blocks.BillingConsolePage;
const returnIndex = pageContent.indexOf('  return (');
const hookBody = pageContent.slice(0, returnIndex).replace('export default function BillingConsolePage() {', 'export function useBillingConsole() {');
const hookReturn = `  return {
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
`;
const fullHook = `import { useState, useMemo } from 'react';\nimport { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';\nimport { adminBillingApi } from '../admin-billing-api';\nimport { TabId } from '../types';\nimport type { BillingUsagePreview, BillingCycleInvoicePreview, BillingPlanFormState } from '../admin-billing-api';\n\n` + hookBody + hookReturn;
fs.writeFileSync(path.join(hooksDir, 'useBillingConsole.ts'), fullHook);

// 12. Write new BillingConsolePage.tsx
const newPageImports = `import { CheckCircle2 } from 'lucide-react';
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
`;
const newPageRender = pageContent.slice(returnIndex);
fs.writeFileSync(path.join(outDir, 'BillingConsolePage.tsx'), newPageImports + '\nexport default function BillingConsolePage() {\n  const state = useBillingConsole();\n  const { activeTab, setActiveTab, selectedTenantId, setSelectedTenantId, usagePreview, setUsagePreview, invoicePreview, setInvoicePreview, selectedInvoiceId, setSelectedInvoiceId, closeModalOpen, setCloseModalOpen, overviewQuery, plansQuery, tenantsQuery, tenantBillingQuery, tenantCyclesQuery, tenantInvoicesQuery, draftInvoicesQuery, invoiceDetailsQuery, paymentConfigQuery, revenueEventsQuery, usageSnapshotsQuery, subscriptionHistoryQuery, settingsQuery, createCycleMutation, closeCycleMutation, createSubscriptionMutation, usagePreviewMutation, invoicePreviewMutation, createPaymentAttemptMutation, markPaymentAttemptPaidMutation, markPaymentAttemptFailedMutation, updatePlanMutation, updateSettingsMutation, tenants, revenueGrowthPlans, selectedTenantBilling } = state;\n\n' + newPageRender);

console.log('Done!');
