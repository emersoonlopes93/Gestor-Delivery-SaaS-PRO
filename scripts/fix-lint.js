const fs = require('fs');

const path = require('path');

const unusedImports = [
  { path: 'apps/web-admin/src/features/billing/components/BillingAuditTab.tsx', regexes: [/TabId, /, /TABS, /, /TabId/, /TABS/] },
  { path: 'apps/web-admin/src/features/billing/components/BillingInvoicesTab.tsx', regexes: [/TabId, /, /TABS, /, /TabId/, /TABS/] },
  { path: 'apps/web-admin/src/features/billing/components/BillingPlansTab.tsx', regexes: [/useMemo, /, /useCallback, /] },
  { path: 'apps/web-admin/src/features/billing/components/BillingSafetyNotice.tsx', regexes: [/BillingRevenueTierInput, /] },
  { path: 'apps/web-admin/src/features/billing/components/BillingShared.tsx', regexes: [/money, /] },
  { path: 'apps/web-admin/src/features/billing/components/BillingStatusBadge.tsx', regexes: [/TabId, /, /TABS, /, /TabId/, /TABS/] },
  { path: 'apps/web-admin/src/features/dashboard/DashboardPage.tsx', regexes: [/Users, /] },
  { path: 'apps/web-admin/src/features/operations/health/HealthPage.tsx', regexes: [/useMemo, /, /ExternalLink, /] },
  { path: 'apps/web-admin/src/features/tenants/TenantAccessPage.tsx', regexes: [/AlertTriangle, /] },
  { path: 'apps/web-admin/src/features/tenants/TenantDetailsPage.tsx', regexes: [/Puzzle, /] },
  { path: 'apps/web-admin/src/features/tenants/TenantsPage.tsx', regexes: [/Bot, /, /CreditCard, /] },
];

for (const f of unusedImports) {
  const p = path.resolve(f.path);
  if (!fs.existsSync(p)) continue;
  let content = fs.readFileSync(p, 'utf8');
  for (const r of f.regexes) {
    content = content.replace(r, '');
  }
  // cleanup empty imports
  content = content.replace(/import { \s* } from '[^']+';\n/g, '');
  fs.writeFileSync(p, content);
}

// HealthPage unused
let healthPath = path.resolve('apps/web-admin/src/features/operations/health/HealthPage.tsx');
if (fs.existsSync(healthPath)) {
  let content = fs.readFileSync(healthPath, 'utf8');
  content = content.replace(/const navigate = useNavigate\(\);\n/, '');
  content = content.replace(/const \[page, setPage\] = useState\(1\);/, 'const [page] = useState(1);');
  content = content.replace(/}, \[\]\);/g, '}, [loadData]);'); // line 89
  fs.writeFileSync(healthPath, content);
}

// TenantsPage unused
let tenantsPath = path.resolve('apps/web-admin/src/features/tenants/TenantsPage.tsx');
if (fs.existsSync(tenantsPath)) {
  let content = fs.readFileSync(tenantsPath, 'utf8');
  content = content.replace(/const handleCreateBillingV2 = async \(\) => {[\s\S]*?};\n/, '');
  fs.writeFileSync(tenantsPath, content);
}

// Exhaustive deps fixes
const depsFixes = [
  { path: 'apps/web-admin/src/features/base-menus/BaseMenusPage.tsx', target: '}, []);', repl: '}, [loadDraft]);', occurrence: 1 },
  { path: 'apps/web-admin/src/features/base-menus/BaseMenusPage.tsx', target: '}, []);', repl: '}, [loadDetail]);', occurrence: 2 },
  { path: 'apps/web-admin/src/features/base-menus/BaseMenusPage.tsx', target: '}, []);', repl: '}, [load]);', occurrence: 3 },
  { path: 'apps/web-admin/src/features/franchise/FranchiseDashboard.tsx', target: '}, []);', repl: '}, [fetchGroups]);', occurrence: 1 },
  { path: 'apps/web-admin/src/features/tenants/TenantAccessPage.tsx', target: '}, []);', repl: '}, [loadData]);', occurrence: 1 },
  { path: 'apps/web-admin/src/features/tenants/TenantDetailsPage.tsx', target: '}, []);', repl: '}, [loadTenant]);', occurrence: 1 },
];

for (const fix of depsFixes) {
  const p = path.resolve(fix.path);
  if (!fs.existsSync(p)) continue;
  let content = fs.readFileSync(p, 'utf8');
  let occurrenceCount = 0;
  content = content.replace(/}, \[\]\);/g, (match) => {
    occurrenceCount++;
    if (occurrenceCount === fix.occurrence) return fix.repl;
    return match;
  });
  fs.writeFileSync(p, content);
}
