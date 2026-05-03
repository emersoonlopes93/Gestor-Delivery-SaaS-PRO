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
export declare const DEFAULT_CAPABILITIES: TenantCapabilities;
/**
 * Capabilities for a "Pro" / "Active" tenant.
 */
export declare const PRO_CAPABILITIES: TenantCapabilities;
//# sourceMappingURL=tenant-capabilities.d.ts.map