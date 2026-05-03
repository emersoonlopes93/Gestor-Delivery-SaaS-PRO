"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRO_CAPABILITIES = exports.DEFAULT_CAPABILITIES = void 0;
/**
 * Default capabilities for a "Trial" or "Basic" tenant.
 */
exports.DEFAULT_CAPABILITIES = {
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
exports.PRO_CAPABILITIES = {
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
//# sourceMappingURL=tenant-capabilities.js.map