export declare enum TenantStatus {
    ACTIVE = "active",
    INACTIVE = "inactive",
    SUSPENDED = "suspended",
    TRIAL = "trial"
}
export declare enum UnitType {
    UN = "un",
    G = "g",
    KG = "kg",
    ML = "ml",
    L = "l"
}
export declare enum StockMovementType {
    IN = "in",
    OUT = "out",
    ADJUST = "adjust",
    WASTE = "waste",
    THEORETICAL_DEPLETION = "theoretical_depletion",
    PURCHASE_ENTRY = "purchase_entry",
    INVENTORY_ADJUSTMENT = "inventory_adjustment"
}
export declare enum ActorType {
    TENANT = "tenant",
    ADMIN = "admin"
}
export declare enum TenantDefaultRole {
    TENANT_OWNER = "tenant_owner",
    TENANT_ADMIN = "tenant_admin",
    MANAGER = "manager",
    ATTENDANT = "attendant",
    CASHIER = "cashier",
    KITCHEN = "kitchen",
    DISPATCHER = "dispatcher",
    DELIVERY_OPERATOR = "delivery_operator",
    FINANCE = "finance",
    MARKETING = "marketing",
    WAITER = "waiter"
}
export declare enum AdminDefaultRole {
    SUPER_ADMIN = "super_admin",
    SUPPORT = "support",
    FINANCIAL = "financial",
    COMMERCIAL = "commercial",
    ONBOARDING = "onboarding",
    OPERATIONS = "operations",
    AUDITOR = "auditor"
}
export declare enum DriverStatus {
    available = "available",
    busy = "busy",
    offline = "offline"
}
export declare enum DriverVehicleType {
    motorcycle = "motorcycle",
    bicycle = "bicycle",
    car = "car"
}
export declare enum CashSessionStatus {
    open = "open",
    closed = "closed"
}
export declare enum CashMovementType {
    opening = "opening",
    sale = "sale",
    withdrawal = "withdrawal",
    supply = "supply",
    refund = "refund",
    adjustment = "adjustment",
    closing = "closing"
}
export declare enum PaymentMethod {
    cash = "cash",
    pix = "pix",
    credit_card = "credit_card",
    debit_card = "debit_card",
    card_on_delivery = "card_on_delivery",
    other = "other"
}
export declare enum GoalType {
    REVENUE = "revenue",
    ORDERS = "orders",
    AVG_TICKET = "avg_ticket",
    PREPARATION_TIME = "preparation_time",
    DELIVERY_TIME = "delivery_time",
    ORDERS_BY_CHANNEL = "orders_by_channel",
    ORDERS_BY_CATEGORY = "orders_by_category",
    GROSS_MARGIN = "gross_margin"
}
export declare enum GoalStatus {
    DRAFT = "draft",
    ACTIVE = "active",
    PAUSED = "paused",
    ACHIEVED = "achieved",
    MISSED = "missed"
}
export declare enum GoalTrendStatus {
    ON_TRACK = "on_track",
    AT_RISK = "at_risk",
    BEHIND = "behind"
}
export declare enum PurchaseStatus {
    DRAFT = "draft",
    PENDING = "pending",
    RECEIVED = "received",
    CANCELLED = "cancelled"
}
export declare enum PaymentStatus {
    PENDING = "pending",
    PARTIAL = "partial",
    PAID = "paid",
    CANCELLED = "cancelled"
}
export declare enum InventoryCountStatus {
    OPEN = "open",
    CLOSED = "closed",
    CANCELLED = "cancelled"
}
export declare enum FinancialAccountType {
    CASH = "cash",
    BANK = "bank",
    DIGITAL_WALLET = "digital_wallet"
}
export declare enum FinancialTransactionType {
    INCOME = "income",
    EXPENSE = "expense"
}
export declare enum FinancialStatus {
    PENDING = "pending",
    PAID = "paid",
    CANCELLED = "cancelled",
    OVERDUE = "overdue"
}
