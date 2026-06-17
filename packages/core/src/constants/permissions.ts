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
  'orders.use_kanban': 'Use operational kanban',
  'orders.use_kds': 'Use kitchen display system',

  // Catalog module
  'catalog.read': 'View catalog',
  'catalog.create': 'Create catalog items',
  'catalog.update': 'Update catalog items',
  'catalog.delete': 'Delete catalog items',
  'catalog.publish': 'Publish catalog items',
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
  'orders.use_kanban': 'Use operational kanban',
  'orders.use_kds': 'Use kitchen display system',

  // Catalog module
  'catalog.read': 'View catalog',
  'catalog.create': 'Create catalog items',
  'catalog.update': 'Update catalog items',
  'catalog.delete': 'Delete catalog items',
  'catalog.publish': 'Publish catalog items',
  'catalog.manage_products': 'Manage catalog products',
  'catalog.manage_option_groups': 'Manage catalog option groups',
  'catalog.bulk_edit': 'Bulk edit catalog',
  'catalog.manage_complements': 'Manage catalog complements',
  'catalog.manage_combos': 'Manage catalog combos',

  // KDS module
  'kds.use': 'Use kitchen display',
  'kds.manage': 'Manage KDS settings',

  // Printing module
  'printing.read': 'View print jobs and stations',
  'printing.manage': 'Manage print stations and devices',
  'printing.print': 'Allow device to pull spooler jobs',
  'printing.reprint': 'Reprint jobs',

  // Cash module
  'cash.read': 'View cash sessions and movements',
  'cash.open': 'Open cash register',
  'cash.close': 'Close cash register',
  'cash.add_supply': 'Add cash supply',
  'cash.add_withdrawal': 'Add cash withdrawal',
  'cash.manage': 'Manage all cash operations',

  // POS module
  'pos.read': 'View POS sales',
  'pos.create_sale': 'Create POS sale',
  'pos.apply_discount': 'Apply manual discount on POS',
  'pos.waiter_mode': 'Access simplified waiter mode',
  'pos.transfer_table': 'Transfer orders between tables',

  // Reports module
  'reports.read': 'View all reports',
  'reports.view_costs': 'View ingredient and product costs',
  'reports.view_margin': 'View product profit margins',
  'reports.export': 'Export reports',

  // Goals & Performance module
  'goals.read': 'View goals and performance metrics',
  'goals.create': 'Create new goals',
  'goals.update': 'Update existing goals',
  'goals.delete': 'Delete goals',

  // CRM & Promotions module
  'crm.read': 'View CRM and Customer data',
  'crm.manage_customers': 'Manage customers',
  'crm.manage_coupons': 'Manage coupons',
  'crm.manage_loyalty_cashback': 'Manage loyalty and cashback config',
  'crm.apply_benefits': 'Apply coupons or cashback at POS',

  // Delivery module
  'delivery.read': 'View delivery info',
  'delivery.manage_drivers': 'Manage delivery drivers',
  'delivery.dispatch': 'Dispatch deliveries',
  'delivery.manage': 'Manage delivery settings',

  // Inventory & Stock module
  'inventory.read': 'View inventory and stock',
  'inventory.create': 'Create inventory items',
  'inventory.update': 'Update inventory items',
  'inventory.adjust': 'Manual stock adjustments',
  'inventory.manage_recipe': 'Manage product technical datasheets',
  'inventory.view_costs': 'View ingredient and recipe costs',
  'inventory.view_margin': 'View product profit margins',

  // Finance module
  'finance.read': 'View financial data',
  'finance.manage': 'Manage financial data',

  // Purchasing module
  'purchasing.read': 'View suppliers and purchases',
  'purchasing.manage': 'Manage suppliers and purchases',

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

  // Billing module
  'billing.read': 'View billing and plans',
  'billing.write': 'Manage billing and subscriptions',

  // Chat module
  'chat.read': 'View chat sessions and messages',
  'chat.send': 'Send chat messages',
  'chat.manage_handoff': 'Manage chat handoff to human',
  'chat.close': 'Close chat sessions',
  'chat.manage_quick_replies': 'Manage quick replies',

  // Scheduling module
  'scheduling.view': 'View scheduling settings and slots',
  'scheduling.manage': 'Manage scheduling settings and windows',
  'scheduling.create': 'Create scheduled orders',
  'scheduling.update': 'Update or cancel scheduled orders',
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
  'saas.tenants.ai.read': 'View tenant AI agent configuration',
  'saas.tenants.ai.manage': 'Manage tenant AI agent configuration',
  'saas.plans.read': 'View plans',
  'saas.plans.manage': 'Manage plans',
  'saas.billing.read': 'View billing',
  'saas.billing.audit': 'Audit billing ledger',
  'saas.billing.manage': 'Manage billing',
  'saas.support.access': 'Access support tools',
  'saas.support.impersonate': 'Impersonate tenant users',
  'saas.audit.read': 'View audit logs',
  'saas.modules.read': 'View modules',
  'saas.modules.manage': 'Manage modules',
  'saas.metrics.read': 'View platform metrics',
  'saas.users.read': 'View admin users',
  'saas.users.manage': 'Manage admin users',
  'saas.onboarding.manage': 'Manage tenant onboarding',
  'saas.ai.read': 'View global AI agent prompt and tools',
  'saas.ai.manage': 'Manage global AI agent prompt',
  'saas.base_menu.read': 'View base menu templates',
  'saas.base_menu.manage': 'Manage base menu templates',
  'saas.base_media.read': 'View base menu media gallery',
  'saas.base_media.manage': 'Manage base menu media gallery',
  'saas.settings.read': 'View system settings',
  'saas.settings.manage': 'Manage system settings',
  'saas.franchise.read': 'View franchise dashboard and groups',
  'saas.franchise.manage': 'Manage franchise operations',
} as const;

export type AdminPermission = keyof typeof ADMIN_PERMISSIONS;

// ============================================================
// Default Role → Permission Mappings
// ============================================================

export const TENANT_ROLE_PERMISSIONS: Record<string, TenantPermission[]> = {
  tenant_owner: Object.keys(TENANT_PERMISSIONS) as TenantPermission[],
  tenant_admin: Object.keys(TENANT_PERMISSIONS) as TenantPermission[],
  manager: [
    'orders.read', 'orders.create', 'orders.update', 'orders.update_status', 'orders.cancel', 'orders.view_timeline', 'orders.use_kanban', 'orders.use_kds',
    'catalog.read', 'catalog.create', 'catalog.update', 'catalog.publish', 'catalog.manage_products', 'catalog.manage_option_groups', 'catalog.bulk_edit', 'catalog.manage_complements', 'catalog.manage_combos',
    'kds.use', 'kds.manage',
    'printing.read', 'printing.manage', 'printing.print', 'printing.reprint',
    'cash.read', 'cash.open', 'cash.close', 'cash.add_supply', 'cash.add_withdrawal', 'cash.manage',
    'pos.read', 'pos.create_sale', 'pos.apply_discount',
    'reports.read', 'reports.view_costs', 'reports.view_margin', 'reports.export',
    'goals.read', 'goals.create', 'goals.update', 'goals.delete',
    'crm.read', 'crm.manage_customers', 'crm.manage_coupons', 'crm.manage_loyalty_cashback', 'crm.apply_benefits',
    'delivery.read', 'delivery.manage_drivers', 'delivery.dispatch', 'delivery.manage',
    'inventory.read', 'inventory.create', 'inventory.update', 'inventory.adjust', 'inventory.manage_recipe', 'inventory.view_costs', 'inventory.view_margin',
    'purchasing.read', 'purchasing.manage',
    'finance.read',
    'settings.read',
    'users.read',
    'dashboard.view',
    'billing.read',
    'chat.read', 'chat.send', 'chat.manage_handoff', 'chat.close', 'chat.manage_quick_replies',
    'scheduling.view', 'scheduling.manage', 'scheduling.create', 'scheduling.update',
  ],
  attendant: [
    'orders.read', 'orders.create', 'orders.update', 'orders.update_status', 'orders.view_timeline', 'orders.use_kanban',
    'catalog.read',
    'pos.read', 'pos.create_sale',
    'cash.read',
    'crm.read', 'crm.apply_benefits',
    'dashboard.view',
    'scheduling.view', 'scheduling.create', 'scheduling.update',
  ],
  cashier: [
    'orders.read', 'orders.create',
    'cash.read', 'cash.open', 'cash.close', 'cash.add_supply', 'cash.add_withdrawal',
    'pos.read', 'pos.create_sale',
    'crm.read', 'crm.apply_benefits',
    'catalog.read',
    'dashboard.view',
    'scheduling.view', 'scheduling.create', 'scheduling.update',
  ],
  kitchen: [
    'orders.read',
    'kds.use',
    'orders.use_kds',
    'scheduling.view',
  ],
  dispatcher: [
    'orders.read',
    'delivery.read', 'delivery.dispatch',
    'dashboard.view',
    'scheduling.view',
  ],
  delivery_operator: [
    'orders.read',
    'delivery.read',
  ],
  finance: [
    'orders.read',
    'reports.read', 'reports.view_costs', 'reports.view_margin', 'reports.export',
    'finance.read', 'finance.manage',
    'purchasing.read', 'purchasing.manage',
    'cash.close',
    'dashboard.view',
    'billing.read', 'billing.write',
  ],
  marketing: [
    'crm.read', 'crm.manage_customers', 'crm.manage_coupons', 'crm.manage_loyalty_cashback',
    'reports.read', 'goals.read',
    'catalog.read',
    'dashboard.view',
  ],
  waiter: [
    'orders.read', 'orders.create', 'orders.update', 'orders.update_status', 'orders.view_timeline',
    'pos.read', 'pos.create_sale', 'pos.waiter_mode', 'pos.transfer_table',
    'catalog.read',
    'dashboard.view',
    'scheduling.view',
  ],
};

export const ADMIN_ROLE_PERMISSIONS: Record<string, AdminPermission[]> = {
  super_admin: Object.keys(ADMIN_PERMISSIONS) as AdminPermission[],
  support: [
    'saas.tenants.read',
    'saas.support.access',
    'saas.audit.read',
    'saas.base_menu.read',
    'saas.base_media.read',
    'saas.franchise.read',
  ],
  financial: [
    'saas.tenants.read',
    'saas.billing.read', 'saas.billing.audit', 'saas.billing.manage',
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
    'saas.modules.read',
    'saas.onboarding.manage',
  ],
  operations: [
    'saas.tenants.read', 'saas.tenants.update',
    'saas.modules.read',
    'saas.modules.manage',
    'saas.metrics.read',
    'saas.audit.read',
    'saas.base_menu.read',
    'saas.base_menu.manage',
    'saas.base_media.read',
    'saas.base_media.manage',
    'saas.franchise.read',
    'saas.franchise.manage',
  ],
  auditor: [
    'saas.tenants.read',
    'saas.audit.read',
    'saas.metrics.read',
    'saas.billing.read',
    'saas.billing.audit',
    'saas.base_menu.read',
    'saas.base_media.read',
    'saas.franchise.read',
  ],
};
