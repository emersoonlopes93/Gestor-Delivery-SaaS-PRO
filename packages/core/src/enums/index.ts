// ============================================================
// Tenant Enums
// ============================================================

// Re-exportando enums diretamente para evitar dependência circular
export enum TenantStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  TRIAL = 'trial',
}

export enum UnitType {
  WEIGHT = 'weight',
  VOLUME = 'volume',
  UNIT = 'unit',
}

export enum StockMovementType {
  IN = 'in',
  OUT = 'out',
  ADJUSTMENT = 'adjustment',
}

export enum ActorType {
  SYSTEM = 'system',
  USER = 'user',
}

export enum TenantDefaultRole {
  OWNER = 'owner',
  MANAGER = 'manager',
  EMPLOYEE = 'employee',
}

export enum AdminDefaultRole {
  SUPER_ADMIN = 'super_admin',
  SUPPORT = 'support',
}
