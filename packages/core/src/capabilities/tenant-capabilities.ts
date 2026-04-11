/**
 * Structure defining what a tenant can or cannot do within the platform.
 * This is used to control access to features and limits based on plans.
 */
export interface TenantCapabilities {
  catalog: {
    maxCategories: number;
    maxProducts: number;
    canUseAddons: boolean;
    canUseCombos: boolean;
  };
  orders: {
    maxActiveOrders: number;
    canUseDeliveryTracking: boolean;
  };
  marketing: {
    canCreateCoupons: boolean;
    canUseLoyaltyProgram: boolean;
  };
  integrations: {
    canUseWebhooks: boolean;
    canUseCustomDomain: boolean;
  };
  reports: {
    canViewCosts: boolean;
    canViewMargin: boolean;
    canExportReports: boolean;
  };
  goals: {
    maxActiveGoals: number;
    canUseSubGoals: boolean;
  };
}

/**
 * Default capabilities for a "Trial" or "Basic" tenant.
 */
export const DEFAULT_CAPABILITIES: TenantCapabilities = {
  catalog: {
    maxCategories: 10,
    maxProducts: 50,
    canUseAddons: true,
    canUseCombos: false,
  },
  orders: {
    maxActiveOrders: 20,
    canUseDeliveryTracking: false,
  },
  marketing: {
    canCreateCoupons: false,
    canUseLoyaltyProgram: false,
  },
  integrations: {
    canUseWebhooks: false,
    canUseCustomDomain: false,
  },
  reports: {
    canViewCosts: false,
    canViewMargin: false,
    canExportReports: false,
  },
  goals: {
    maxActiveGoals: 3,
    canUseSubGoals: false,
  },
};

/**
 * Capabilities for a "Pro" / "Active" tenant.
 */
export const PRO_CAPABILITIES: TenantCapabilities = {
  catalog: {
    maxCategories: 100,
    maxProducts: 1000,
    canUseAddons: true,
    canUseCombos: true,
  },
  orders: {
    maxActiveOrders: 999999,
    canUseDeliveryTracking: true,
  },
  marketing: {
    canCreateCoupons: true,
    canUseLoyaltyProgram: true,
  },
  integrations: {
    canUseWebhooks: true,
    canUseCustomDomain: true,
  },
  reports: {
    canViewCosts: true,
    canViewMargin: true,
    canExportReports: true,
  },
  goals: {
    maxActiveGoals: 50,
    canUseSubGoals: true,
  },
};
