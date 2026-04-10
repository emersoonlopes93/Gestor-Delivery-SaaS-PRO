// ============================================================
// Tenant Permissions — Granular permissions per module/action
// ============================================================

export const TENANT_PERMISSIONS = {
  // Orders module
  'orders.read': 'View orders',
  'orders.create': 'Create orders',
  'orders.update': 'Update orders',
  'orders.update_status': 'Update order status',
  'orders.cancel': 'Cancel orders',
  'orders.view_timeline': 'View order timeline',
  'orders.manage': 'Full order management',
  'orders.use_kanban': 'Use operational kanban',

  // Catalog module
  'catalog.read': 'View catalog',
  'catalog.create': 'Create catalog items',
  'catalog.update': 'Update catalog items',
  'catalog.delete': 'Delete catalog items',
  'catalog.publish': 'Publish catalog items',
  'catalog.manage_complements': 'Manage catalog complements',
  'catalog.manage_combos': 'Manage catalog combos',

  // KDS module
  'kds.use': 'Use kitchen display',
  'kds.manage': 'Manage KDS settings',

  // Cash module
  'cash.open': 'Open cash register',
  'cash.close': 'Close cash register',
  'cash.manage': 'Manage cash operations',

  // Reports module
  'reports.view': 'View reports',
  'reports.export': 'Export reports',

  // CRM module
  'crm.read': 'View CRM data',
  'crm.manage': 'Manage CRM data',

  // Delivery module
  'delivery.read': 'View delivery info',
  'delivery.dispatch': 'Dispatch deliveries',
  'delivery.manage': 'Manage delivery settings',

  // Stock module
  'stock.read': 'View stock',
  'stock.manage': 'Manage stock',

  // Finance module
  'finance.read': 'View financial data',
  'finance.manage': 'Manage financial data',

  // Settings module
  'settings.read': 'View settings',
  'settings.manage': 'Manage settings',

  // Users module
  'users.read': 'View users',
  'users.create': 'Create users',
  'users.update': 'Update users',
  'users.delete': 'Delete users',
  'users.roles': 'Manage user roles',

  // Dashboard
  'dashboard.view': 'View dashboard',
} as const;

export type TenantPermission = keyof typeof TENANT_PERMISSIONS;

// ============================================================
// Admin Permissions — SaaS Admin granular permissions
// ============================================================

export const ADMIN_PERMISSIONS = {
  'saas.tenants.read': 'View tenants',
  'saas.tenants.create': 'Create tenants',
  'saas.tenants.update': 'Update tenants',
  'saas.tenants.suspend': 'Suspend tenants',
  'saas.plans.read': 'View plans',
  'saas.plans.manage': 'Manage plans',
  'saas.billing.read': 'View billing',
  'saas.billing.manage': 'Manage billing',
  'saas.support.access': 'Access support tools',
  'saas.support.impersonate': 'Impersonate tenant users',
  'saas.audit.read': 'View audit logs',
  'saas.modules.manage': 'Manage modules',
  'saas.metrics.read': 'View platform metrics',
  'saas.users.read': 'View admin users',
  'saas.users.manage': 'Manage admin users',
  'saas.onboarding.manage': 'Manage tenant onboarding',
} as const;

export type AdminPermission = keyof typeof ADMIN_PERMISSIONS;

// ============================================================
// Default Role → Permission Mappings
// ============================================================

export const TENANT_ROLE_PERMISSIONS: Record<string, TenantPermission[]> = {
  tenant_owner: Object.keys(TENANT_PERMISSIONS) as TenantPermission[],
  tenant_admin: Object.keys(TENANT_PERMISSIONS) as TenantPermission[],
  manager: [
    'orders.read', 'orders.create', 'orders.update', 'orders.update_status', 'orders.cancel', 'orders.view_timeline', 'orders.use_kanban',
    'catalog.read', 'catalog.create', 'catalog.update', 'catalog.publish', 'catalog.manage_complements', 'catalog.manage_combos',
    'kds.use', 'kds.manage',
    'cash.open', 'cash.close', 'cash.manage',
    'reports.view', 'reports.export',
    'crm.read', 'crm.manage',
    'delivery.read', 'delivery.dispatch', 'delivery.manage',
    'stock.read', 'stock.manage',
    'finance.read',
    'settings.read',
    'users.read',
    'dashboard.view',
  ],
  attendant: [
    'orders.read', 'orders.create', 'orders.update', 'orders.update_status', 'orders.view_timeline', 'orders.use_kanban',
    'catalog.read',
    'crm.read',
    'dashboard.view',
  ],
  cashier: [
    'orders.read', 'orders.create',
    'cash.open', 'cash.close', 'cash.manage',
    'catalog.read',
    'dashboard.view',
  ],
  kitchen: [
    'orders.read',
    'kds.use',
  ],
  dispatcher: [
    'orders.read',
    'delivery.read', 'delivery.dispatch',
    'dashboard.view',
  ],
  delivery_operator: [
    'orders.read',
    'delivery.read',
  ],
  finance: [
    'orders.read',
    'reports.view', 'reports.export',
    'finance.read', 'finance.manage',
    'cash.close',
    'dashboard.view',
  ],
  marketing: [
    'crm.read', 'crm.manage',
    'reports.view',
    'catalog.read',
    'dashboard.view',
  ],
};

export const ADMIN_ROLE_PERMISSIONS: Record<string, AdminPermission[]> = {
  super_admin: Object.keys(ADMIN_PERMISSIONS) as AdminPermission[],
  support: [
    'saas.tenants.read',
    'saas.support.access',
    'saas.audit.read',
  ],
  financial: [
    'saas.tenants.read',
    'saas.billing.read', 'saas.billing.manage',
    'saas.metrics.read',
  ],
  commercial: [
    'saas.tenants.read', 'saas.tenants.create',
    'saas.plans.read',
    'saas.onboarding.manage',
    'saas.metrics.read',
  ],
  onboarding: [
    'saas.tenants.read', 'saas.tenants.create',
    'saas.onboarding.manage',
  ],
  operations: [
    'saas.tenants.read', 'saas.tenants.update',
    'saas.modules.manage',
    'saas.metrics.read',
    'saas.audit.read',
  ],
  auditor: [
    'saas.tenants.read',
    'saas.audit.read',
    'saas.metrics.read',
    'saas.billing.read',
  ],
};
