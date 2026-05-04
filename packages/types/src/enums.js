"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinancialStatus = exports.FinancialTransactionType = exports.FinancialAccountType = exports.InventoryCountStatus = exports.PaymentStatus = exports.PurchaseStatus = exports.GoalTrendStatus = exports.GoalStatus = exports.GoalType = exports.PaymentMethod = exports.CashMovementType = exports.CashSessionStatus = exports.DriverVehicleType = exports.DriverStatus = exports.AdminDefaultRole = exports.TenantDefaultRole = exports.ActorType = exports.StockMovementType = exports.UnitType = exports.TenantStatus = void 0;
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
var DriverStatus;
(function (DriverStatus) {
    DriverStatus["available"] = "available";
    DriverStatus["busy"] = "busy";
    DriverStatus["offline"] = "offline";
})(DriverStatus || (exports.DriverStatus = DriverStatus = {}));
var DriverVehicleType;
(function (DriverVehicleType) {
    DriverVehicleType["motorcycle"] = "motorcycle";
    DriverVehicleType["bicycle"] = "bicycle";
    DriverVehicleType["car"] = "car";
})(DriverVehicleType || (exports.DriverVehicleType = DriverVehicleType = {}));
var CashSessionStatus;
(function (CashSessionStatus) {
    CashSessionStatus["open"] = "open";
    CashSessionStatus["closed"] = "closed";
})(CashSessionStatus || (exports.CashSessionStatus = CashSessionStatus = {}));
var CashMovementType;
(function (CashMovementType) {
    CashMovementType["opening"] = "opening";
    CashMovementType["sale"] = "sale";
    CashMovementType["withdrawal"] = "withdrawal";
    CashMovementType["supply"] = "supply";
    CashMovementType["refund"] = "refund";
    CashMovementType["adjustment"] = "adjustment";
    CashMovementType["closing"] = "closing";
})(CashMovementType || (exports.CashMovementType = CashMovementType = {}));
var PaymentMethod;
(function (PaymentMethod) {
    PaymentMethod["cash"] = "cash";
    PaymentMethod["pix"] = "pix";
    PaymentMethod["credit_card"] = "credit_card";
    PaymentMethod["debit_card"] = "debit_card";
    PaymentMethod["card_on_delivery"] = "card_on_delivery";
    PaymentMethod["other"] = "other";
})(PaymentMethod || (exports.PaymentMethod = PaymentMethod = {}));
var GoalType;
(function (GoalType) {
    GoalType["REVENUE"] = "revenue";
    GoalType["ORDERS"] = "orders";
    GoalType["AVG_TICKET"] = "avg_ticket";
    GoalType["PREPARATION_TIME"] = "preparation_time";
    GoalType["DELIVERY_TIME"] = "delivery_time";
    GoalType["ORDERS_BY_CHANNEL"] = "orders_by_channel";
    GoalType["ORDERS_BY_CATEGORY"] = "orders_by_category";
    GoalType["GROSS_MARGIN"] = "gross_margin";
})(GoalType || (exports.GoalType = GoalType = {}));
var GoalStatus;
(function (GoalStatus) {
    GoalStatus["DRAFT"] = "draft";
    GoalStatus["ACTIVE"] = "active";
    GoalStatus["PAUSED"] = "paused";
    GoalStatus["ACHIEVED"] = "achieved";
    GoalStatus["MISSED"] = "missed";
})(GoalStatus || (exports.GoalStatus = GoalStatus = {}));
var GoalTrendStatus;
(function (GoalTrendStatus) {
    GoalTrendStatus["ON_TRACK"] = "on_track";
    GoalTrendStatus["AT_RISK"] = "at_risk";
    GoalTrendStatus["BEHIND"] = "behind";
})(GoalTrendStatus || (exports.GoalTrendStatus = GoalTrendStatus = {}));
var PurchaseStatus;
(function (PurchaseStatus) {
    PurchaseStatus["DRAFT"] = "draft";
    PurchaseStatus["PENDING"] = "pending";
    PurchaseStatus["RECEIVED"] = "received";
    PurchaseStatus["CANCELLED"] = "cancelled";
})(PurchaseStatus || (exports.PurchaseStatus = PurchaseStatus = {}));
var PaymentStatus;
(function (PaymentStatus) {
    PaymentStatus["PENDING"] = "pending";
    PaymentStatus["PARTIAL"] = "partial";
    PaymentStatus["PAID"] = "paid";
    PaymentStatus["CANCELLED"] = "cancelled";
})(PaymentStatus || (exports.PaymentStatus = PaymentStatus = {}));
var InventoryCountStatus;
(function (InventoryCountStatus) {
    InventoryCountStatus["OPEN"] = "open";
    InventoryCountStatus["CLOSED"] = "closed";
    InventoryCountStatus["CANCELLED"] = "cancelled";
})(InventoryCountStatus || (exports.InventoryCountStatus = InventoryCountStatus = {}));
var FinancialAccountType;
(function (FinancialAccountType) {
    FinancialAccountType["CASH"] = "cash";
    FinancialAccountType["BANK"] = "bank";
    FinancialAccountType["DIGITAL_WALLET"] = "digital_wallet";
})(FinancialAccountType || (exports.FinancialAccountType = FinancialAccountType = {}));
var FinancialTransactionType;
(function (FinancialTransactionType) {
    FinancialTransactionType["INCOME"] = "income";
    FinancialTransactionType["EXPENSE"] = "expense";
})(FinancialTransactionType || (exports.FinancialTransactionType = FinancialTransactionType = {}));
var FinancialStatus;
(function (FinancialStatus) {
    FinancialStatus["PENDING"] = "pending";
    FinancialStatus["PAID"] = "paid";
    FinancialStatus["CANCELLED"] = "cancelled";
    FinancialStatus["OVERDUE"] = "overdue";
})(FinancialStatus || (exports.FinancialStatus = FinancialStatus = {}));
//# sourceMappingURL=enums.js.map