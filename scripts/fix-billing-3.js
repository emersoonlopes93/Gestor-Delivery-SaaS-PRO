const fs = require('fs');
const path = require('path');

function cleanImports(file) {
  if (!fs.existsSync(file)) return;
  let content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  const otherLines = [];
  const typeImports = new Set();
  const apiImports = new Set();
  
  for (let line of lines) {
    if (line.includes("from '../types'")) {
      const match = line.match(/import\s+{([^}]+)}\s+from\s+'\.\.\/types'/);
      if (match) {
        match[1].split(',').forEach(t => typeImports.add(t.trim()));
      }
    } else if (line.includes("from '../admin-billing-api'")) {
      const match = line.match(/import\s+(?:type\s+)?{([^}]+)}\s+from\s+'\.\.\/admin-billing-api'/);
      if (match) {
        match[1].split(',').forEach(t => apiImports.add(t.trim().replace('type ', '')));
      }
    } else {
      otherLines.push(line);
    }
  }
  
  typeImports.delete('');
  apiImports.delete('');
  
  let newImports = '';
  if (apiImports.size > 0) newImports += `import { ${[...apiImports].join(', ')} } from '../admin-billing-api';\n`;
  if (typeImports.size > 0) newImports += `import { ${[...typeImports].join(', ')} } from '../types';\n`;
  
  fs.writeFileSync(file, newImports + otherLines.join('\n'));
}

const comps = ['BillingAuditTab.tsx', 'BillingInvoicesTab.tsx', 'BillingOverviewTab.tsx', 'BillingPlansTab.tsx', 'BillingSafetyNotice.tsx', 'BillingShared.tsx', 'BillingStatusBadge.tsx', 'BillingSubscriptionsTab.tsx'];
for (const c of comps) {
  cleanImports(path.join('apps/web-admin/src/features/billing/components', c));
}
cleanImports('apps/web-admin/src/features/billing/hooks/useBillingConsole.ts');

// Fix BillingPlansTab.tsx rowId issue
let plansTab = fs.readFileSync('apps/web-admin/src/features/billing/components/BillingPlansTab.tsx', 'utf8');
plansTab = plansTab.replace(/rowId: tier\.id,/g, 'rowId: tier.id || shortId(tier.id),');
fs.writeFileSync('apps/web-admin/src/features/billing/components/BillingPlansTab.tsx', plansTab);

// Fix TenantDetailsPage.tsx items issue
let tenantPage = fs.readFileSync('apps/web-admin/src/features/tenants/TenantDetailsPage.tsx', 'utf8');
tenantPage = tenantPage.replace(/data\.data\.data\.items/g, 'data.data.items');
fs.writeFileSync('apps/web-admin/src/features/tenants/TenantDetailsPage.tsx', tenantPage);

// Add missing InvoiceSummary
let hook = fs.readFileSync('apps/web-admin/src/features/billing/hooks/useBillingConsole.ts', 'utf8');
if (!hook.includes('InvoiceSummary')) {
  hook = hook.replace(/import { (.*) } from '\.\.\/admin-billing-api';/, "import { $1, InvoiceSummary } from '../admin-billing-api';");
  fs.writeFileSync('apps/web-admin/src/features/billing/hooks/useBillingConsole.ts', hook);
}

console.log('Fixed phase 3');
