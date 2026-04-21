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
  WAITER = 'waiter',
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

// ============================================================
// Delivery Enums
// ============================================================

export enum DriverStatus {
  available = 'available',
  busy = 'busy',
  offline = 'offline',
}

export enum DriverVehicleType {
  motorcycle = 'motorcycle',
  bicycle = 'bicycle',
  car = 'car',
}

// ============================================================
// Cash Enums
// ============================================================

export enum CashSessionStatus {
  open = 'open',
  closed = 'closed',
}

export enum CashMovementType {
  opening = 'opening',
  sale = 'sale',
  withdrawal = 'withdrawal',
  supply = 'supply',
  refund = 'refund',
  adjustment = 'adjustment',
  closing = 'closing',
}

// ============================================================
// POS Enums
// ============================================================

export enum PaymentMethod {
  cash = 'cash',
  pix = 'pix',
  credit_card = 'credit_card',
  debit_card = 'debit_card',
  card_on_delivery = 'card_on_delivery',
  other = 'other',
}

// ============================================================
// Analytics & Goals Enums (Phase 10)
// ============================================================

export enum GoalType {
  REVENUE = 'revenue',
  ORDERS = 'orders',
  AVG_TICKET = 'avg_ticket',
  PREPARATION_TIME = 'preparation_time',
  DELIVERY_TIME = 'delivery_time',
  ORDERS_BY_CHANNEL = 'orders_by_channel',
  ORDERS_BY_CATEGORY = 'orders_by_category',
  GROSS_MARGIN = 'gross_margin',
}

export enum GoalStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  ACHIEVED = 'achieved',
  MISSED = 'missed',
}

export enum GoalTrendStatus {
  ON_TRACK = 'on_track',
  AT_RISK = 'at_risk',
  BEHIND = 'behind',
}
