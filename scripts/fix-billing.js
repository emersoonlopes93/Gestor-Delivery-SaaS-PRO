const fs = require('fs');
const path = require('path');

const outDir = 'apps/web-admin/src/features/billing';
const componentsDir = path.join(outDir, 'components');
const typesFile = path.join(outDir, 'types.ts');
const safetyFile = path.join(componentsDir, 'BillingSafetyNotice.tsx');
const sharedFile = path.join(componentsDir, 'BillingShared.tsx');
const statusBadgeFile = path.join(componentsDir, 'BillingStatusBadge.tsx');
const apiFile = path.join(outDir, 'admin-billing-api.ts');

// 1. Move BillingTierForm and BillingPlanFormState to types.ts and add exports to everything
let typesContent = fs.readFileSync(typesFile, 'utf8');
typesContent = typesContent.replace(/type /g, 'export type ');
typesContent = typesContent.replace(/const /g, 'export const ');
typesContent = typesContent.replace(/function /g, 'export function ');

let safetyContent = fs.readFileSync(safetyFile, 'utf8');
const formTypesMatch = safetyContent.match(/type BillingTierForm =[\s\S]*?};/);
if (formTypesMatch) {
  safetyContent = safetyContent.replace(formTypesMatch[0], '');
  fs.writeFileSync(safetyFile, safetyContent);
  
  // Add to types.ts
  typesContent += '\nimport { BillingRevenueTierInput } from \'./admin-billing-api\';\n';
  typesContent += formTypesMatch[0].replace(/type /g, 'export type ') + '\n';
}
fs.writeFileSync(typesFile, typesContent);

// 2. Fix self-imports
function removeSelfImport(file, componentName) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    const regex = new RegExp(`import {[^}]*${componentName}[^}]*} from '\\./[a-zA-Z]+';\\n?`, 'g');
    content = content.replace(regex, '');
    fs.writeFileSync(file, content);
  }
}
removeSelfImport(statusBadgeFile, 'StatusBadge');
removeSelfImport(sharedFile, 'Panel'); // It imports from ./BillingShared which we can just remove entirely
if (fs.existsSync(sharedFile)) {
  let content = fs.readFileSync(sharedFile, 'utf8');
  content = content.replace(/import {.*} from '\.\/BillingShared';\n?/g, '');
  fs.writeFileSync(sharedFile, content);
}

// 3. Fix missing imports in components
function addTypeImport(file, types) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    const importMatch = content.match(/import {([^}]+)} from '\.\.\/types';/);
    if (importMatch) {
      let existing = importMatch[1].split(',').map(s => s.trim());
      for (const t of types) {
        if (!existing.includes(t)) existing.push(t);
      }
      content = content.replace(importMatch[0], `import { ${existing.join(', ')} } from '../types';`);
    } else {
      content = `import { ${types.join(', ')} } from '../types';\n` + content;
    }
    fs.writeFileSync(file, content);
  }
}

addTypeImport(path.join(componentsDir, 'BillingPlansTab.tsx'), ['BillingPlanFormState', 'BillingTierForm']);
const hooksDir = path.join(outDir, 'hooks');
addTypeImport(path.join(hooksDir, 'useBillingConsole.ts'), ['BillingPlanFormState']);

if (fs.existsSync(path.join(hooksDir, 'useBillingConsole.ts'))) {
  let content = fs.readFileSync(path.join(hooksDir, 'useBillingConsole.ts'), 'utf8');
  content = content.replace(/import type {.*BillingPlanFormState.*} from '\.\.\/admin-billing-api';/, 
    "import type { BillingUsagePreview, BillingCycleInvoicePreview } from '../admin-billing-api';\nimport { BillingPlanFormState } from '../types';");
  fs.writeFileSync(path.join(hooksDir, 'useBillingConsole.ts'), content);
}

// Also add implicit any fixes in BillingPlansTab by adding correct types
// BillingPlansTab has issues with `current` parameter implicit any because it couldn't find BillingPlanFormState. Once imported, it will be fine.

// Let's add types to the missing imports in other tabs as reported:
// BillingInvoicesTab: money, formatDate, shortId, metadataText, TabId, TABS, statusLabels
addTypeImport(path.join(componentsDir, 'BillingInvoicesTab.tsx'), ['money', 'formatDate', 'shortId', 'metadataText', 'TabId', 'TABS', 'statusLabels']);
addTypeImport(path.join(componentsDir, 'BillingAuditTab.tsx'), ['formatDate', 'shortId', 'TabId', 'TABS', 'statusLabels']);
addTypeImport(path.join(componentsDir, 'BillingOverviewTab.tsx'), ['money']);
addTypeImport(path.join(componentsDir, 'BillingSubscriptionsTab.tsx'), ['money', 'formatDate', 'shortId']);
addTypeImport(path.join(componentsDir, 'BillingStatusBadge.tsx'), ['statusBadgeClass', 'TabId', 'TABS', 'statusLabels']);
addTypeImport(path.join(componentsDir, 'BillingShared.tsx'), ['money']);

let subsContent = fs.readFileSync(path.join(componentsDir, 'BillingSubscriptionsTab.tsx'), 'utf8');
if (!subsContent.includes('InvoiceItemsTable')) {
  subsContent = `import { InvoiceItemsTable } from './BillingInvoicesTab';\n` + subsContent;
  fs.writeFileSync(path.join(componentsDir, 'BillingSubscriptionsTab.tsx'), subsContent);
} else if (!subsContent.includes("from './BillingInvoicesTab'")) {
  subsContent = `import { InvoiceItemsTable } from './BillingInvoicesTab';\n` + subsContent;
  fs.writeFileSync(path.join(componentsDir, 'BillingSubscriptionsTab.tsx'), subsContent);
}

console.log('Fixed billing TS issues');
