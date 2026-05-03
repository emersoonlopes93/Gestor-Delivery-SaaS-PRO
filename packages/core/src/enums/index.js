"use strict";
// ============================================================
// Tenant Enums
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminDefaultRole = exports.TenantDefaultRole = exports.ActorType = exports.StockMovementType = exports.UnitType = exports.TenantStatus = void 0;
var TenantStatus;
(function (TenantStatus) {
    TenantStatus["ACTIVE"] = "active";
    TenantStatus["INACTIVE"] = "inactive";
    TenantStatus["SUSPENDED"] = "suspended";
    TenantStatus["TRIAL"] = "trial";
})(TenantStatus || (exports.TenantStatus = TenantStatus = {}));
var UnitType;
(function (UnitType) {
    UnitType["UN"] = "un";
    UnitType["G"] = "g";
    UnitType["KG"] = "kg";
    UnitType["ML"] = "ml";
    UnitType["L"] = "l";
})(UnitType || (exports.UnitType = UnitType = {}));
var StockMovementType;
(function (StockMovementType) {
    StockMovementType["IN"] = "in";
    StockMovementType["OUT"] = "out";
    StockMovementType["ADJUST"] = "adjust";
    StockMovementType["WASTE"] = "waste";
    StockMovementType["THEORETICAL_DEPLETION"] = "theoretical_depletion";
    StockMovementType["PURCHASE_ENTRY"] = "purchase_entry";
    StockMovementType["INVENTORY_ADJUSTMENT"] = "inventory_adjustment";
})(StockMovementType || (exports.StockMovementType = StockMovementType = {}));
var ActorType;
(function (ActorType) {
    ActorType["SYSTEM"] = "system";
    ActorType["USER"] = "user";
    ActorType["TENANT"] = "tenant";
    ActorType["ADMIN"] = "admin";
})(ActorType || (exports.ActorType = ActorType = {}));
var TenantDefaultRole;
(function (TenantDefaultRole) {
    TenantDefaultRole["TENANT_OWNER"] = "tenant_owner";
    TenantDefaultRole["TENANT_ADMIN"] = "tenant_admin";
    TenantDefaultRole["MANAGER"] = "manager";
    TenantDefaultRole["ATTENDANT"] = "attendant";
    TenantDefaultRole["CASHIER"] = "cashier";
    TenantDefaultRole["KITCHEN"] = "kitchen";
    TenantDefaultRole["DISPATCHER"] = "dispatcher";
    TenantDefaultRole["DELIVERY_OPERATOR"] = "delivery_operator";
    TenantDefaultRole["FINANCE"] = "finance";
    TenantDefaultRole["MARKETING"] = "marketing";
    TenantDefaultRole["WAITER"] = "waiter";
})(TenantDefaultRole || (exports.TenantDefaultRole = TenantDefaultRole = {}));
var AdminDefaultRole;
(function (AdminDefaultRole) {
    AdminDefaultRole["SUPER_ADMIN"] = "super_admin";
    AdminDefaultRole["SUPPORT"] = "support";
    AdminDefaultRole["FINANCIAL"] = "financial";
    AdminDefaultRole["COMMERCIAL"] = "commercial";
    AdminDefaultRole["ONBOARDING"] = "onboarding";
    AdminDefaultRole["OPERATIONS"] = "operations";
    AdminDefaultRole["AUDITOR"] = "auditor";
})(AdminDefaultRole || (exports.AdminDefaultRole = AdminDefaultRole = {}));
//# sourceMappingURL=index.js.map