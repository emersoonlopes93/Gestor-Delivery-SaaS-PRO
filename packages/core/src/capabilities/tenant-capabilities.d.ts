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
export declare const DEFAULT_CAPABILITIES: TenantCapabilities;
export declare const PRO_CAPABILITIES: TenantCapabilities;
