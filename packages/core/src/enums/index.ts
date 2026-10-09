// ============================================================
// Tenant Enums
// ============================================================

export enum TenantStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  TRIAL = 'trial',
}

export enum UnitType {
  UN = 'un',
  G = 'g',
  KG = 'kg',
  ML = 'ml',
  L = 'l',
}

export enum StockMovementType {
  IN = 'in',
  OUT = 'out',
  ADJUST = 'adjust',
  WASTE = 'waste',
  THEORETICAL_DEPLETION = 'theoretical_depletion',
  THEORETICAL_REVERSAL = 'theoretical_reversal',
  PURCHASE_ENTRY = 'purchase_entry',
  INVENTORY_ADJUSTMENT = 'inventory_adjustment',
}

export enum ActorType {
  SYSTEM = 'system',
  USER = 'user',
  TENANT = 'tenant',
  ADMIN = 'admin',
}

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
  WAITER = 'waiter',
}

export enum AdminDefaultRole {
  SUPER_ADMIN = 'super_admin',
  SUPPORT = 'support',
  FINANCIAL = 'financial',
  COMMERCIAL = 'commercial',
  ONBOARDING = 'onboarding',
  OPERATIONS = 'operations',
  AUDITOR = 'auditor',
}
