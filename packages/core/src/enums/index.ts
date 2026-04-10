// ============================================================
// Tenant Enums
// ============================================================

export enum TenantStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  TRIAL = 'trial',
}

// ============================================================
// Auth Enums
// ============================================================

export enum ActorType {
  TENANT = 'tenant',
  ADMIN = 'admin',
}

// ============================================================
// RBAC — Tenant Default Roles (slugs)
// ============================================================

export enum TenantDefaultRole {
  TENANT_OWNER = 'tenant_owner',
  TENANT_ADMIN = 'tenant_admin',
  MANAGER = 'manager',
  ATTENDANT = 'attendant',
  CASHIER = 'cashier',
  KITCHEN = 'kitchen',
  DISPATCHER = 'dispatcher',
  DELIVERY_OPERATOR = 'delivery_operator',
  FINANCE = 'finance',
  MARKETING = 'marketing',
}

// ============================================================
// RBAC — Admin Default Roles (slugs)
// ============================================================

export enum AdminDefaultRole {
  SUPER_ADMIN = 'super_admin',
  SUPPORT = 'support',
  FINANCIAL = 'financial',
  COMMERCIAL = 'commercial',
  ONBOARDING = 'onboarding',
  OPERATIONS = 'operations',
  AUDITOR = 'auditor',
}
