// ============================================================
// Tenant Enums
// ============================================================
export var TenantStatus;
(function (TenantStatus) {
    TenantStatus["ACTIVE"] = "active";
    TenantStatus["INACTIVE"] = "inactive";
    TenantStatus["SUSPENDED"] = "suspended";
    TenantStatus["TRIAL"] = "trial";
})(TenantStatus || (TenantStatus = {}));
export var UnitType;
(function (UnitType) {
    UnitType["UN"] = "un";
    UnitType["G"] = "g";
    UnitType["KG"] = "kg";
    UnitType["ML"] = "ml";
    UnitType["L"] = "l";
})(UnitType || (UnitType = {}));
export var StockMovementType;
(function (StockMovementType) {
    StockMovementType["IN"] = "in";
    StockMovementType["OUT"] = "out";
    StockMovementType["ADJUST"] = "adjust";
    StockMovementType["WASTE"] = "waste";
    StockMovementType["THEORETICAL_DEPLETION"] = "theoretical_depletion";
    StockMovementType["PURCHASE_ENTRY"] = "purchase_entry";
    StockMovementType["INVENTORY_ADJUSTMENT"] = "inventory_adjustment";
})(StockMovementType || (StockMovementType = {}));
// ============================================================
// Auth Enums
// ============================================================
export var ActorType;
(function (ActorType) {
    ActorType["TENANT"] = "tenant";
    ActorType["ADMIN"] = "admin";
})(ActorType || (ActorType = {}));
// ============================================================
// RBAC — Tenant Default Roles (slugs)
// ============================================================
export var TenantDefaultRole;
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
})(TenantDefaultRole || (TenantDefaultRole = {}));
// ============================================================
// RBAC — Admin Default Roles (slugs)
// ============================================================
export var AdminDefaultRole;
(function (AdminDefaultRole) {
    AdminDefaultRole["SUPER_ADMIN"] = "super_admin";
    AdminDefaultRole["SUPPORT"] = "support";
    AdminDefaultRole["FINANCIAL"] = "financial";
    AdminDefaultRole["COMMERCIAL"] = "commercial";
    AdminDefaultRole["ONBOARDING"] = "onboarding";
    AdminDefaultRole["OPERATIONS"] = "operations";
    AdminDefaultRole["AUDITOR"] = "auditor";
})(AdminDefaultRole || (AdminDefaultRole = {}));
// ============================================================
// Delivery Enums
// ============================================================
export var DriverStatus;
(function (DriverStatus) {
    DriverStatus["available"] = "available";
    DriverStatus["busy"] = "busy";
    DriverStatus["offline"] = "offline";
})(DriverStatus || (DriverStatus = {}));
export var DriverVehicleType;
(function (DriverVehicleType) {
    DriverVehicleType["motorcycle"] = "motorcycle";
    DriverVehicleType["bicycle"] = "bicycle";
    DriverVehicleType["car"] = "car";
})(DriverVehicleType || (DriverVehicleType = {}));
// ============================================================
// Cash Enums
// ============================================================
export var CashSessionStatus;
(function (CashSessionStatus) {
    CashSessionStatus["open"] = "open";
    CashSessionStatus["closed"] = "closed";
})(CashSessionStatus || (CashSessionStatus = {}));
export var CashMovementType;
(function (CashMovementType) {
    CashMovementType["opening"] = "opening";
    CashMovementType["sale"] = "sale";
    CashMovementType["withdrawal"] = "withdrawal";
    CashMovementType["supply"] = "supply";
    CashMovementType["refund"] = "refund";
    CashMovementType["adjustment"] = "adjustment";
    CashMovementType["closing"] = "closing";
})(CashMovementType || (CashMovementType = {}));
// ============================================================
// POS Enums
// ============================================================
export var PaymentMethod;
(function (PaymentMethod) {
    PaymentMethod["cash"] = "cash";
    PaymentMethod["pix"] = "pix";
    PaymentMethod["credit_card"] = "credit_card";
    PaymentMethod["debit_card"] = "debit_card";
    PaymentMethod["card_on_delivery"] = "card_on_delivery";
    PaymentMethod["other"] = "other";
})(PaymentMethod || (PaymentMethod = {}));
// ============================================================
// Analytics & Goals Enums (Phase 10)
// ============================================================
export var GoalType;
(function (GoalType) {
    GoalType["REVENUE"] = "revenue";
    GoalType["ORDERS"] = "orders";
    GoalType["AVG_TICKET"] = "avg_ticket";
    GoalType["PREPARATION_TIME"] = "preparation_time";
    GoalType["DELIVERY_TIME"] = "delivery_time";
    GoalType["ORDERS_BY_CHANNEL"] = "orders_by_channel";
    GoalType["ORDERS_BY_CATEGORY"] = "orders_by_category";
    GoalType["GROSS_MARGIN"] = "gross_margin";
})(GoalType || (GoalType = {}));
export var GoalStatus;
(function (GoalStatus) {
    GoalStatus["DRAFT"] = "draft";
    GoalStatus["ACTIVE"] = "active";
    GoalStatus["PAUSED"] = "paused";
    GoalStatus["ACHIEVED"] = "achieved";
    GoalStatus["MISSED"] = "missed";
})(GoalStatus || (GoalStatus = {}));
export var GoalTrendStatus;
(function (GoalTrendStatus) {
    GoalTrendStatus["ON_TRACK"] = "on_track";
    GoalTrendStatus["AT_RISK"] = "at_risk";
    GoalTrendStatus["BEHIND"] = "behind";
})(GoalTrendStatus || (GoalTrendStatus = {}));
// ============================================================
// Phase 3 — Management Enums
// ============================================================
export var PurchaseStatus;
(function (PurchaseStatus) {
    PurchaseStatus["DRAFT"] = "draft";
    PurchaseStatus["PENDING"] = "pending";
    PurchaseStatus["RECEIVED"] = "received";
    PurchaseStatus["CANCELLED"] = "cancelled";
})(PurchaseStatus || (PurchaseStatus = {}));
export var PaymentStatus;
(function (PaymentStatus) {
    PaymentStatus["PENDING"] = "pending";
    PaymentStatus["PARTIAL"] = "partial";
    PaymentStatus["PAID"] = "paid";
    PaymentStatus["CANCELLED"] = "cancelled";
})(PaymentStatus || (PaymentStatus = {}));
export var InventoryCountStatus;
(function (InventoryCountStatus) {
    InventoryCountStatus["OPEN"] = "open";
    InventoryCountStatus["CLOSED"] = "closed";
    InventoryCountStatus["CANCELLED"] = "cancelled";
})(InventoryCountStatus || (InventoryCountStatus = {}));
export var FinancialAccountType;
(function (FinancialAccountType) {
    FinancialAccountType["CASH"] = "cash";
    FinancialAccountType["BANK"] = "bank";
    FinancialAccountType["DIGITAL_WALLET"] = "digital_wallet";
})(FinancialAccountType || (FinancialAccountType = {}));
export var FinancialTransactionType;
(function (FinancialTransactionType) {
    FinancialTransactionType["INCOME"] = "income";
    FinancialTransactionType["EXPENSE"] = "expense";
})(FinancialTransactionType || (FinancialTransactionType = {}));
export var FinancialStatus;
(function (FinancialStatus) {
    FinancialStatus["PENDING"] = "pending";
    FinancialStatus["PAID"] = "paid";
    FinancialStatus["CANCELLED"] = "cancelled";
    FinancialStatus["OVERDUE"] = "overdue";
})(FinancialStatus || (FinancialStatus = {}));
//# sourceMappingURL=enums.js.map