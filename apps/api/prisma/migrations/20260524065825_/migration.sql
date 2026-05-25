-- CreateEnum
CREATE TYPE "TimeSlotStatus" AS ENUM ('available', 'occupied', 'blocked');

-- CreateEnum
CREATE TYPE "OrderSplitStatus" AS ENUM ('pending', 'confirmed', 'cancelled');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('active', 'inactive', 'suspended', 'trial');

-- CreateEnum
CREATE TYPE "CategoryTemplateType" AS ENUM ('none', 'pizza');

-- CreateEnum
CREATE TYPE "CatalogProductType" AS ENUM ('simple', 'configurable', 'combo');

-- CreateEnum
CREATE TYPE "ComboMode" AS ENUM ('bundle', 'slot');

-- CreateEnum
CREATE TYPE "ComboPricingType" AS ENUM ('fixed_price', 'discount_percent', 'discount_amount');

-- CreateEnum
CREATE TYPE "OptionSelectionType" AS ENUM ('single', 'multiple', 'quantity');

-- CreateEnum
CREATE TYPE "PriceImpactType" AS ENUM ('none', 'fixed', 'replace', 'percentage');

-- CreateEnum
CREATE TYPE "PricingAxis" AS ENUM ('primary', 'secondary');

-- CreateEnum
CREATE TYPE "CatalogPublicationStatus" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "CatalogOperationalStatus" AS ENUM ('active', 'inactive', 'hidden', 'sold_out_manual');

-- CreateEnum
CREATE TYPE "CatalogSalesChannel" AS ENUM ('storefront_delivery', 'storefront_pickup', 'pos');

-- CreateEnum
CREATE TYPE "UpsellType" AS ENUM ('product_list', 'category_based');

-- CreateEnum
CREATE TYPE "UpsellPricingType" AS ENUM ('normal', 'discount_percent', 'discount_amount', 'fixed_price');

-- CreateEnum
CREATE TYPE "UpsellDisplayType" AS ENUM ('inline', 'cart', 'both');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'confirmed', 'preparing', 'ready_for_pickup', 'ready_for_delivery', 'out_for_delivery', 'completed', 'cancelled', 'draft');

-- CreateEnum
CREATE TYPE "FulfillmentType" AS ENUM ('delivery', 'pickup', 'dine_in', 'table');

-- CreateEnum
CREATE TYPE "OrderLineType" AS ENUM ('product', 'combo');

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('available', 'busy', 'offline');

-- CreateEnum
CREATE TYPE "DriverVehicleType" AS ENUM ('motorcycle', 'bicycle', 'car');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'pix', 'credit_card', 'debit_card', 'other', 'card_on_delivery');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('monthly', 'yearly');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('trial', 'active', 'canceled', 'overdue', 'suspended');

-- CreateEnum
CREATE TYPE "PaymentTxStatus" AS ENUM ('pending', 'confirmed', 'failed', 'expired');

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('percentage', 'fixed');

-- CreateEnum
CREATE TYPE "ScheduledOrderStatus" AS ENUM ('scheduled', 'confirmed', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "CashSessionStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('opening', 'sale', 'withdrawal', 'supply', 'refund', 'adjustment', 'closing');

-- CreateEnum
CREATE TYPE "PrintType" AS ENUM ('customer', 'kitchen', 'summary');

-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('pending', 'printing', 'failed', 'completed');

-- CreateEnum
CREATE TYPE "CashbackTransactionType" AS ENUM ('earned', 'used', 'expired', 'refunded');

-- CreateEnum
CREATE TYPE "UnitType" AS ENUM ('un', 'g', 'kg', 'ml', 'l');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('in', 'out', 'adjust', 'waste', 'theoretical_depletion', 'purchase_entry', 'inventory_adjustment');

-- CreateEnum
CREATE TYPE "RateType" AS ENUM ('neighborhood', 'distance', 'fixed', 'polygon');

-- CreateEnum
CREATE TYPE "DeliveryZoneKind" AS ENUM ('blocked_zone', 'custom_zone');

-- CreateEnum
CREATE TYPE "DeliveryPricingMode" AS ENUM ('fixed', 'distance', 'free', 'tiers');

-- CreateEnum
CREATE TYPE "GoalType" AS ENUM ('revenue', 'orders', 'avg_ticket', 'preparation_time', 'delivery_time', 'orders_by_channel', 'orders_by_category', 'gross_margin');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('draft', 'active', 'paused', 'achieved', 'missed');

-- CreateEnum
CREATE TYPE "DineInTableStatus" AS ENUM ('free', 'occupied', 'waiting_bill', 'reserved');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('draft', 'pending', 'received', 'cancelled');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'partial', 'paid', 'cancelled');

-- CreateEnum
CREATE TYPE "InventoryCountStatus" AS ENUM ('open', 'closed', 'cancelled');

-- CreateEnum
CREATE TYPE "FinancialAccountType" AS ENUM ('cash', 'bank', 'digital_wallet');

-- CreateEnum
CREATE TYPE "FinancialTransactionType" AS ENUM ('income', 'expense');

-- CreateEnum
CREATE TYPE "FinancialStatus" AS ENUM ('pending', 'paid', 'cancelled', 'overdue');

-- CreateEnum
CREATE TYPE "WhatsAppInstanceStatus" AS ENUM ('connected', 'disconnected', 'connecting', 'qr_pending');

-- CreateEnum
CREATE TYPE "WhatsAppProviderType" AS ENUM ('evolution_go', 'meta_cloud');

-- CreateEnum
CREATE TYPE "AiProviderType" AS ENUM ('openai', 'anthropic');

-- CreateEnum
CREATE TYPE "ChatState" AS ENUM ('greeting', 'browsing_menu', 'building_cart', 'collecting_address', 'awaiting_confirmation', 'order_created', 'handoff_human', 'closed');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "CampaignDispatchStatus" AS ENUM ('queued', 'processing', 'sent', 'delivered', 'read', 'replied', 'failed', 'opt_out');

-- CreateTable
CREATE TABLE "business_groups" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "owner_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "business_group_id" TEXT,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "order_sequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "user_id" TEXT,
    "user_type" TEXT NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "resource" VARCHAR(100),
    "details" JSONB,
    "ip" VARCHAR(45),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_onboardings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "step_basic_info" BOOLEAN NOT NULL DEFAULT false,
    "step_operating_hours" BOOLEAN NOT NULL DEFAULT false,
    "step_logo" BOOLEAN NOT NULL DEFAULT false,
    "step_address" BOOLEAN NOT NULL DEFAULT false,
    "step_delivery" BOOLEAN NOT NULL DEFAULT false,
    "step_payments" BOOLEAN NOT NULL DEFAULT false,
    "step_whatsapp" BOOLEAN NOT NULL DEFAULT false,
    "step_menu" BOOLEAN NOT NULL DEFAULT false,
    "step_catalog" BOOLEAN NOT NULL DEFAULT false,
    "step_first_order" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_onboardings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "option_groups" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "selection_type" "OptionSelectionType" NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "min_select" INTEGER NOT NULL DEFAULT 0,
    "max_select" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "option_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "option_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "option_group_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sku" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "price_impact_type" "PriceImpactType" NOT NULL DEFAULT 'none',
    "price_impact_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "allow_quantity" BOOLEAN NOT NULL DEFAULT false,
    "min_qty" INTEGER,
    "max_qty" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "option_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_option_item_prices" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "option_item_id" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "cost_price" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_option_item_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_option_group_links" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "option_group_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "override_name" TEXT,
    "override_description" TEXT,
    "override_is_required" BOOLEAN,
    "override_min_select" INTEGER,
    "override_max_select" INTEGER,
    "pricing_axis" "PricingAxis" NOT NULL DEFAULT 'secondary',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_option_group_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_publications" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "publication_status" "CatalogPublicationStatus" NOT NULL DEFAULT 'draft',
    "operational_status" "CatalogOperationalStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "catalog_availability_rules" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "publication_id" TEXT NOT NULL,
    "channel" "CatalogSalesChannel" NOT NULL,
    "days_of_week" INTEGER[],
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "catalog_availability_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combo_slots" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "combo_product_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "min_select" INTEGER NOT NULL DEFAULT 1,
    "max_select" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "combo_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combo_slot_allowed_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "combo_slot_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "additional_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "combo_slot_allowed_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_settings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'America/Sao_Paulo',
    "currency" VARCHAR(10) NOT NULL DEFAULT 'BRL',
    "language" VARCHAR(10) NOT NULL DEFAULT 'pt-BR',
    "business_phone" VARCHAR(20),
    "business_email" VARCHAR(255),
    "address" TEXT,
    "logo_url" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_store_paused" BOOLEAN NOT NULL DEFAULT false,
    "store_pause_reason" TEXT,
    "bank_account" VARCHAR(50),
    "bank_agency" VARCHAR(20),
    "bank_name" VARCHAR(100),
    "city" VARCHAR(100),
    "cnpj" VARCHAR(18),
    "complement" VARCHAR(255),
    "inscricao_estadual" VARCHAR(20),
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "neighborhood" VARCHAR(100),
    "number" VARCHAR(20),
    "payment_methods" JSONB,
    "pix_key" VARCHAR(255),
    "razao_social" VARCHAR(255),
    "state" VARCHAR(2),
    "street" VARCHAR(255),
    "zip_code" VARCHAR(10),
    "tax_regime" VARCHAR(20),
    "mercado_pago_access_token" VARCHAR(500),
    "mercado_pago_public_key" VARCHAR(255),
    "mercado_pago_webhook_secret" VARCHAR(255),
    "standard_cfop" VARCHAR(10),
    "standard_ncm" VARCHAR(10),
    "whatsapp_notifications_enabled" BOOLEAN NOT NULL DEFAULT false,
    "notification_templates" JSONB,
    "audio_notification_enabled" BOOLEAN NOT NULL DEFAULT true,
    "new_order_sound" TEXT NOT NULL DEFAULT 'default',
    "cancellation_sound" TEXT NOT NULL DEFAULT 'default',
    "notification_volume" DOUBLE PRECISION NOT NULL DEFAULT 1.0,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_operating_hours" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "is_open" BOOLEAN NOT NULL DEFAULT true,
    "open_time" VARCHAR(5),
    "close_time" VARCHAR(5),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_operating_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_users" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_roles" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "description" VARCHAR(255),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_permissions" (
    "id" TEXT NOT NULL,
    "module" VARCHAR(50) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_role_permissions" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "tenant_role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_user_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,

    CONSTRAINT "tenant_user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_roles" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "description" VARCHAR(255),
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_permissions" (
    "id" TEXT NOT NULL,
    "module" VARCHAR(50) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_role_permissions" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,

    CONSTRAINT "admin_role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_user_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,

    CONSTRAINT "admin_user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "template_config" JSONB,
    "template_type" "CategoryTemplateType" NOT NULL DEFAULT 'none',

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "category_id" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "short_description" TEXT,
    "long_description" TEXT,
    "base_price" DECIMAL(10,2) NOT NULL,
    "image" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "sellable_online" BOOLEAN NOT NULL DEFAULT true,
    "cost_price" DECIMAL(10,2),
    "sku" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "type" "CatalogProductType" NOT NULL DEFAULT 'simple',
    "combo_mode" "ComboMode",
    "combo_pricing_type" "ComboPricingType",
    "combo_pricing_value" DECIMAL(10,2),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combo_bundle_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "combo_product_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "combo_bundle_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_complement_groups" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "min_select" INTEGER NOT NULL DEFAULT 0,
    "max_select" INTEGER NOT NULL DEFAULT 1,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_complement_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_complement_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "additional_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sku" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_complement_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_complement_group_links" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "complement_group_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_complement_group_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_combos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "base_price" DECIMAL(10,2) NOT NULL,
    "image" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "product_combos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_combo_blocks" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "combo_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "min_select" INTEGER NOT NULL DEFAULT 1,
    "max_select" INTEGER NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_combo_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_combo_block_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "block_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "additional_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_combo_block_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upsells" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "image_url" VARCHAR(500),
    "upsell_type" "UpsellType" NOT NULL DEFAULT 'product_list',
    "pricing_type" "UpsellPricingType" NOT NULL DEFAULT 'normal',
    "pricing_value" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "display_type" "UpsellDisplayType" NOT NULL DEFAULT 'both',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "upsells_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "upsell_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "upsell_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "upsell_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_upsells" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "upsell_id" TEXT NOT NULL,

    CONSTRAINT "product_upsells_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "order_number" VARCHAR(20) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "fulfillment_type" "FulfillmentType" NOT NULL,
    "customer_name" VARCHAR(150) NOT NULL,
    "customer_phone" VARCHAR(30) NOT NULL,
    "customer_email" VARCHAR(255),
    "items_subtotal" DECIMAL(10,2) NOT NULL,
    "discount_total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "delivery_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "service_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "source_channel" VARCHAR(30) NOT NULL DEFAULT 'storefront',
    "idempotency_key" VARCHAR(100) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "delivery_driver_id" TEXT,
    "cash_session_id" TEXT,
    "payment_method" "PaymentMethod",
    "cashback_used" DECIMAL(10,2),
    "coupon_id" TEXT,
    "customer_id" TEXT,
    "delivery_lat" DOUBLE PRECISION,
    "delivery_lng" DOUBLE PRECISION,
    "public_tracking_token" TEXT NOT NULL,
    "change_for" DECIMAL(10,2),
    "table_number" VARCHAR(20),
    "waiter_id" TEXT,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "line_type" "OrderLineType" NOT NULL,
    "product_id" TEXT,
    "combo_id" TEXT,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "line_total" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "snapshot_name" VARCHAR(200) NOT NULL,
    "snapshot_image" VARCHAR(500),
    "snapshot_base_price" DECIMAL(10,2) NOT NULL,
    "snapshot_extras_total" DECIMAL(10,2) NOT NULL,
    "snapshot_composition" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot_catalog_v2_json" JSONB,
    "source_upsell_id" TEXT,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_complements" (
    "id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "complement_item_id" TEXT NOT NULL,
    "snapshot_name" VARCHAR(200) NOT NULL,
    "snapshot_price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "order_item_complements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_combo_selections" (
    "id" TEXT NOT NULL,
    "order_item_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "combo_block_item_id" TEXT NOT NULL,
    "snapshot_block_name" VARCHAR(200) NOT NULL,
    "snapshot_product_name" VARCHAR(200) NOT NULL,
    "snapshot_additional_price" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "order_item_combo_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_delivery_addresses" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "street" VARCHAR(255) NOT NULL,
    "number" VARCHAR(20) NOT NULL,
    "complement" VARCHAR(100),
    "neighborhood" VARCHAR(100) NOT NULL,
    "city" VARCHAR(100) NOT NULL,
    "state" VARCHAR(2) NOT NULL,
    "zip_code" VARCHAR(10) NOT NULL,
    "reference" VARCHAR(255),
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,

    CONSTRAINT "order_delivery_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_timelines" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" TEXT,
    "actor_type" TEXT DEFAULT 'tenant_user',

    CONSTRAINT "order_timelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_drivers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "pin" VARCHAR(60),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "status" "DriverStatus" NOT NULL DEFAULT 'offline',
    "vehicle_type" "DriverVehicleType" NOT NULL DEFAULT 'motorcycle',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "current_lat" DOUBLE PRECISION,
    "current_lng" DOUBLE PRECISION,
    "last_location_at" TIMESTAMP(3),

    CONSTRAINT "delivery_drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_driver_locations" (
    "id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_driver_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL DEFAULT 'monthly',
    "features" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "asaas_id" TEXT,
    "mp_preapproval_plan_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantSubscription" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "trial_ends_at" TIMESTAMP(3),
    "current_period_starts_at" TIMESTAMP(3) NOT NULL,
    "current_period_ends_at" TIMESTAMP(3) NOT NULL,
    "canceled_at" TIMESTAMP(3),
    "asaas_customer_id" TEXT,
    "asaas_subscription_id" TEXT,
    "mp_customer_id" TEXT,
    "mp_preapproval_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentTransaction" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "order_id" TEXT,
    "gateway_name" VARCHAR(50) NOT NULL,
    "gateway_tx_id" VARCHAR(255) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "PaymentTxStatus" NOT NULL DEFAULT 'pending',
    "metadata" JSONB,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "type" "CouponType" NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "min_order_value" DECIMAL(10,2),
    "usage_limit" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderCoupon" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "coupon_id" TEXT NOT NULL,
    "discount_amount" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "OrderCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "operator_id" TEXT NOT NULL,
    "status" "CashSessionStatus" NOT NULL DEFAULT 'open',
    "opening_amount" DECIMAL(10,2) NOT NULL,
    "closing_amount_declared" DECIMAL(10,2),
    "closing_amount_calculated" DECIMAL(10,2),
    "closing_difference" DECIMAL(10,2),
    "notes" TEXT,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "cash_session_id" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "payment_method" "PaymentMethod",
    "order_id" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "email" VARCHAR(255),
    "notes" TEXT,
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "total_spent" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "last_order_date" TIMESTAMP(3),
    "loyalty_points" INTEGER NOT NULL DEFAULT 0,
    "cashback_balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashback_transactions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "order_id" TEXT,
    "type" "CashbackTransactionType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cashback_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredients" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "sku" VARCHAR(50),
    "description" TEXT,
    "unit" "UnitType" NOT NULL,
    "purchase_unit" "UnitType",
    "conversion_factor" DECIMAL(10,4) NOT NULL DEFAULT 1,
    "category" VARCHAR(50),
    "current_cost" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "current_stock" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "min_stock" DECIMAL(10,4),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(10,4) NOT NULL,
    "unit_cost" DECIMAL(10,4),
    "order_id" TEXT,
    "user_id" TEXT,
    "notes" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_recipe_ingredients" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "quantity" DECIMAL(10,4) NOT NULL,

    CONSTRAINT "product_recipe_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complement_recipe_ingredients" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "complement_item_id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "quantity" DECIMAL(10,4) NOT NULL,

    CONSTRAINT "complement_recipe_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combo_recipe_ingredients" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "combo_id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "quantity" DECIMAL(10,4) NOT NULL,

    CONSTRAINT "combo_recipe_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_coverage_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "store_lat" DOUBLE PRECISION NOT NULL,
    "store_lng" DOUBLE PRECISION NOT NULL,
    "max_radius_km" DECIMAL(6,2) NOT NULL,
    "default_price_per_km" DECIMAL(10,2) NOT NULL,
    "minimum_fee" DECIMAL(10,2),
    "maximum_fee" DECIMAL(10,2),
    "is_delivery_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_coverage_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_rate_rules" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" "RateType" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "neighborhood" VARCHAR(100),
    "rate" DECIMAL(10,2),
    "min_km" DECIMAL(5,2),
    "max_km" DECIMAL(5,2),
    "rate_per_km" DECIMAL(10,2),
    "fixed_rate" DECIMAL(10,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "geo_json" JSONB,
    "is_fallback" BOOLEAN NOT NULL DEFAULT false,
    "max_distance_km" DECIMAL(5,2),
    "min_distance_km" DECIMAL(5,2),
    "polygon_coordinates" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 1000,
    "blocks_delivery" BOOLEAN NOT NULL DEFAULT false,
    "color" VARCHAR(16),
    "fixed_fee" DECIMAL(10,2),
    "name" VARCHAR(120),
    "price_per_km" DECIMAL(10,2),
    "pricing_mode" "DeliveryPricingMode",
    "zone_kind" "DeliveryZoneKind",

    CONSTRAINT "delivery_rate_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_rate_distance_tiers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "delivery_rate_rule_id" TEXT NOT NULL,
    "min_distance_km" DECIMAL(5,2) NOT NULL,
    "max_distance_km" DECIMAL(5,2) NOT NULL,
    "fee" DECIMAL(10,2) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_rate_distance_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_module_access" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "module" VARCHAR(50) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_module_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "type" "GoalType" NOT NULL,
    "target_value" DECIMAL(10,2) NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'active',
    "parent_id" TEXT,
    "target_id" VARCHAR(100),
    "responsible_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_otps" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "code" VARCHAR(6) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "customer_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dine_in_tables" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "status" "DineInTableStatus" NOT NULL DEFAULT 'free',
    "active_order_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dine_in_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_jobs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "station" VARCHAR(50) NOT NULL,
    "type" "PrintType" NOT NULL,
    "content" TEXT NOT NULL,
    "status" "PrintJobStatus" NOT NULL DEFAULT 'pending',
    "tries" INTEGER NOT NULL DEFAULT 0,
    "last_tried_at" TIMESTAMP(3),
    "printed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_slots" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "current_occupancy" INTEGER NOT NULL DEFAULT 0,
    "status" "TimeSlotStatus" NOT NULL DEFAULT 'available',
    "min_order_value" DECIMAL(10,2),
    "max_order_value" DECIMAL(10,2),
    "max_items" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "time_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_orders" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "order_id" TEXT,
    "customer_id" TEXT,
    "time_slot_id" TEXT,
    "customer_name" VARCHAR(100) NOT NULL,
    "customer_phone" VARCHAR(20) NOT NULL,
    "fulfillment_type" "FulfillmentType" NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "estimated_duration" INTEGER NOT NULL DEFAULT 30,
    "notes" TEXT,
    "status" "ScheduledOrderStatus" NOT NULL DEFAULT 'scheduled',
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "cnpj" VARCHAR(18),
    "email" VARCHAR(255),
    "phone" VARCHAR(30),
    "contact_name" VARCHAR(100),
    "category" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "number" VARCHAR(50),
    "total_value" DECIMAL(10,2) NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'draft',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "purchase_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "purchase_id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "quantity" DECIMAL(10,4) NOT NULL,
    "unit_cost" DECIMAL(10,4) NOT NULL,
    "total_cost" DECIMAL(10,4) NOT NULL,
    "expiry_date" TIMESTAMP(3),

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_counts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "status" "InventoryCountStatus" NOT NULL DEFAULT 'open',
    "note" TEXT,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_count_items" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "inventory_count_id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "theoretical_stock" DECIMAL(10,4) NOT NULL,
    "physical_stock" DECIMAL(10,4) NOT NULL,
    "adjusted_quantity" DECIMAL(10,4) NOT NULL,

    CONSTRAINT "inventory_count_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_accounts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "type" "FinancialAccountType" NOT NULL DEFAULT 'cash',
    "balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_transactions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "account_id" TEXT,
    "type" "FinancialTransactionType" NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "FinancialStatus" NOT NULL DEFAULT 'pending',
    "due_date" TIMESTAMP(3),
    "payment_date" TIMESTAMP(3),
    "description" TEXT,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_splits" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "split_type" TEXT NOT NULL,
    "description" TEXT,
    "subtotal_amount" DECIMAL(10,2) NOT NULL,
    "discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "service_fee_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "delivery_fee_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(10,2) NOT NULL,
    "responsible_person" TEXT,
    "responsible_phone" TEXT,
    "notes" TEXT,
    "status" "OrderSplitStatus" NOT NULL DEFAULT 'pending',
    "confirmed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_splits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "split_payments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "order_split_id" TEXT NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "change_for" DECIMAL(10,2),
    "notes" TEXT,
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "paid_at" TIMESTAMP(3),
    "payment_tx_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "split_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_instances" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider_type" "WhatsAppProviderType" NOT NULL DEFAULT 'evolution_go',
    "instance_name" VARCHAR(100) NOT NULL,
    "api_url" VARCHAR(500) NOT NULL,
    "api_key" VARCHAR(500) NOT NULL,
    "phone_number" VARCHAR(30),
    "status" "WhatsAppInstanceStatus" NOT NULL DEFAULT 'disconnected',
    "webhook_secret" VARCHAR(255),
    "evolution_instance_id" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "customer_phone" VARCHAR(30) NOT NULL,
    "customer_id" TEXT,
    "state" "ChatState" NOT NULL DEFAULT 'greeting',
    "cart_data" JSONB,
    "handoff_active" BOOLEAN NOT NULL DEFAULT false,
    "handoff_operator" TEXT,
    "handoff_reason" TEXT,
    "handoff_at" TIMESTAMP(3),
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "content" TEXT NOT NULL,
    "message_type" VARCHAR(30) NOT NULL DEFAULT 'text',
    "external_id" VARCHAR(100),
    "tool_calls" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_configs" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "default_whatsapp_provider" "WhatsAppProviderType" NOT NULL DEFAULT 'evolution_go',
    "default_ai_provider" "AiProviderType" NOT NULL DEFAULT 'openai',
    "evolution_url" VARCHAR(500),
    "evolution_global_token" VARCHAR(500),
    "openai_api_key" TEXT,
    "anthropic_api_key" TEXT,
    "base_ai_prompt" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agent_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "agent_name" VARCHAR(100),
    "greeting_message" TEXT,
    "tone" VARCHAR(30) NOT NULL DEFAULT 'friendly',
    "custom_instructions" TEXT,
    "operating_mode" VARCHAR(30) NOT NULL DEFAULT 'always',
    "handoff_policy" VARCHAR(30) NOT NULL DEFAULT 'on_request',
    "fallback_message" TEXT,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "session_timeout_min" INTEGER NOT NULL DEFAULT 120,
    "daily_message_limit" INTEGER NOT NULL DEFAULT 1000,
    "customer_cooldown_min" INTEGER NOT NULL DEFAULT 5,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_agent_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "objective" VARCHAR(100),
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "message_template" TEXT NOT NULL,
    "media_url" VARCHAR(500),
    "segment_rules" JSONB NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "total_audience" INTEGER NOT NULL DEFAULT 0,
    "total_sent" INTEGER NOT NULL DEFAULT 0,
    "total_delivered" INTEGER NOT NULL DEFAULT 0,
    "total_read" INTEGER NOT NULL DEFAULT 0,
    "total_replied" INTEGER NOT NULL DEFAULT 0,
    "total_converted" INTEGER NOT NULL DEFAULT 0,
    "total_opt_out" INTEGER NOT NULL DEFAULT 0,
    "max_dispatches" INTEGER NOT NULL DEFAULT 500,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_dispatches" (
    "id" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "status" "CampaignDispatchStatus" NOT NULL DEFAULT 'queued',
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "replied_at" TIMESTAMP(3),
    "fail_reason" TEXT,
    "external_id" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_opt_outs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "phone" VARCHAR(30) NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_opt_outs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_idx" ON "audit_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_onboardings_tenant_id_key" ON "tenant_onboardings"("tenant_id");

-- CreateIndex
CREATE INDEX "option_groups_tenant_id_idx" ON "option_groups"("tenant_id");

-- CreateIndex
CREATE INDEX "option_items_tenant_id_idx" ON "option_items"("tenant_id");

-- CreateIndex
CREATE INDEX "option_items_option_group_id_idx" ON "option_items"("option_group_id");

-- CreateIndex
CREATE INDEX "product_option_item_prices_tenant_id_idx" ON "product_option_item_prices"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_option_item_prices_product_id_option_item_id_key" ON "product_option_item_prices"("product_id", "option_item_id");

-- CreateIndex
CREATE INDEX "product_option_group_links_tenant_id_idx" ON "product_option_group_links"("tenant_id");

-- CreateIndex
CREATE INDEX "product_option_group_links_product_id_idx" ON "product_option_group_links"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_option_group_links_product_id_option_group_id_key" ON "product_option_group_links"("product_id", "option_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "catalog_publications_product_id_key" ON "catalog_publications"("product_id");

-- CreateIndex
CREATE INDEX "catalog_publications_tenant_id_idx" ON "catalog_publications"("tenant_id");

-- CreateIndex
CREATE INDEX "catalog_publications_tenant_id_publication_status_idx" ON "catalog_publications"("tenant_id", "publication_status");

-- CreateIndex
CREATE INDEX "catalog_publications_tenant_id_operational_status_idx" ON "catalog_publications"("tenant_id", "operational_status");

-- CreateIndex
CREATE INDEX "catalog_availability_rules_tenant_id_idx" ON "catalog_availability_rules"("tenant_id");

-- CreateIndex
CREATE INDEX "catalog_availability_rules_publication_id_idx" ON "catalog_availability_rules"("publication_id");

-- CreateIndex
CREATE INDEX "combo_slots_tenant_id_idx" ON "combo_slots"("tenant_id");

-- CreateIndex
CREATE INDEX "combo_slots_combo_product_id_idx" ON "combo_slots"("combo_product_id");

-- CreateIndex
CREATE INDEX "combo_slot_allowed_items_tenant_id_idx" ON "combo_slot_allowed_items"("tenant_id");

-- CreateIndex
CREATE INDEX "combo_slot_allowed_items_product_id_idx" ON "combo_slot_allowed_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "combo_slot_allowed_items_combo_slot_id_product_id_key" ON "combo_slot_allowed_items"("combo_slot_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_settings_tenant_id_key" ON "tenant_settings"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_operating_hours_tenant_id_day_of_week_key" ON "tenant_operating_hours"("tenant_id", "day_of_week");

-- CreateIndex
CREATE INDEX "tenant_users_tenant_id_idx" ON "tenant_users"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_users_tenant_id_email_key" ON "tenant_users"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "tenant_roles_tenant_id_idx" ON "tenant_roles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_roles_tenant_id_slug_key" ON "tenant_roles"("tenant_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_permissions_slug_key" ON "tenant_permissions"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_role_permissions_role_id_permission_id_key" ON "tenant_role_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_user_roles_user_id_role_id_key" ON "tenant_user_roles"("user_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admin_roles_slug_key" ON "admin_roles"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "admin_permissions_slug_key" ON "admin_permissions"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "admin_role_permissions_role_id_permission_id_key" ON "admin_role_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_user_roles_user_id_role_id_key" ON "admin_user_roles"("user_id", "role_id");

-- CreateIndex
CREATE INDEX "product_categories_tenant_id_idx" ON "product_categories"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_tenant_id_slug_key" ON "product_categories"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "products_tenant_id_idx" ON "products"("tenant_id");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_slug_key" ON "products"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "combo_bundle_items_tenant_id_idx" ON "combo_bundle_items"("tenant_id");

-- CreateIndex
CREATE INDEX "combo_bundle_items_product_id_idx" ON "combo_bundle_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "combo_bundle_items_combo_product_id_product_id_key" ON "combo_bundle_items"("combo_product_id", "product_id");

-- CreateIndex
CREATE INDEX "product_complement_groups_tenant_id_idx" ON "product_complement_groups"("tenant_id");

-- CreateIndex
CREATE INDEX "product_complement_items_tenant_id_idx" ON "product_complement_items"("tenant_id");

-- CreateIndex
CREATE INDEX "product_complement_items_group_id_idx" ON "product_complement_items"("group_id");

-- CreateIndex
CREATE INDEX "product_complement_group_links_tenant_id_idx" ON "product_complement_group_links"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_complement_group_links_product_id_complement_group__key" ON "product_complement_group_links"("product_id", "complement_group_id");

-- CreateIndex
CREATE INDEX "product_combos_tenant_id_idx" ON "product_combos"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_combos_tenant_id_slug_key" ON "product_combos"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "product_combo_blocks_tenant_id_idx" ON "product_combo_blocks"("tenant_id");

-- CreateIndex
CREATE INDEX "product_combo_blocks_combo_id_idx" ON "product_combo_blocks"("combo_id");

-- CreateIndex
CREATE INDEX "product_combo_block_items_tenant_id_idx" ON "product_combo_block_items"("tenant_id");

-- CreateIndex
CREATE INDEX "product_combo_block_items_product_id_idx" ON "product_combo_block_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_combo_block_items_block_id_product_id_key" ON "product_combo_block_items"("block_id", "product_id");

-- CreateIndex
CREATE INDEX "upsells_tenant_id_idx" ON "upsells"("tenant_id");

-- CreateIndex
CREATE INDEX "upsell_items_upsell_id_idx" ON "upsell_items"("upsell_id");

-- CreateIndex
CREATE INDEX "upsell_items_product_id_idx" ON "upsell_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_upsells_product_id_upsell_id_key" ON "product_upsells"("product_id", "upsell_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_public_tracking_token_key" ON "orders"("public_tracking_token");

-- CreateIndex
CREATE INDEX "orders_tenant_id_idx" ON "orders"("tenant_id");

-- CreateIndex
CREATE INDEX "orders_tenant_id_status_idx" ON "orders"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "orders_tenant_id_idempotency_key_key" ON "orders"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "orders_tenant_id_order_number_key" ON "orders"("tenant_id", "order_number");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_tenant_id_idx" ON "order_items"("tenant_id");

-- CreateIndex
CREATE INDEX "order_item_complements_order_item_id_idx" ON "order_item_complements"("order_item_id");

-- CreateIndex
CREATE INDEX "order_item_combo_selections_order_item_id_idx" ON "order_item_combo_selections"("order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_delivery_addresses_order_id_key" ON "order_delivery_addresses"("order_id");

-- CreateIndex
CREATE INDEX "order_delivery_addresses_tenant_id_idx" ON "order_delivery_addresses"("tenant_id");

-- CreateIndex
CREATE INDEX "order_timelines_order_id_idx" ON "order_timelines"("order_id");

-- CreateIndex
CREATE INDEX "order_timelines_tenant_id_idx" ON "order_timelines"("tenant_id");

-- CreateIndex
CREATE INDEX "delivery_drivers_tenant_id_idx" ON "delivery_drivers"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_drivers_tenant_id_phone_key" ON "delivery_drivers"("tenant_id", "phone");

-- CreateIndex
CREATE INDEX "delivery_driver_locations_tenant_id_idx" ON "delivery_driver_locations"("tenant_id");

-- CreateIndex
CREATE INDEX "delivery_driver_locations_tenant_id_driver_id_created_at_idx" ON "delivery_driver_locations"("tenant_id", "driver_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_slug_key" ON "Plan"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "TenantSubscription_tenant_id_key" ON "TenantSubscription"("tenant_id");

-- CreateIndex
CREATE INDEX "PaymentTransaction_tenant_id_status_idx" ON "PaymentTransaction"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "PaymentTransaction_gateway_tx_id_idx" ON "PaymentTransaction"("gateway_tx_id");

-- CreateIndex
CREATE INDEX "coupons_tenant_id_idx" ON "coupons"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_tenant_id_code_key" ON "coupons"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "OrderCoupon_order_id_coupon_id_key" ON "OrderCoupon"("order_id", "coupon_id");

-- CreateIndex
CREATE INDEX "cash_sessions_tenant_id_idx" ON "cash_sessions"("tenant_id");

-- CreateIndex
CREATE INDEX "cash_sessions_operator_id_idx" ON "cash_sessions"("operator_id");

-- CreateIndex
CREATE INDEX "cash_movements_cash_session_id_idx" ON "cash_movements"("cash_session_id");

-- CreateIndex
CREATE INDEX "cash_movements_tenant_id_idx" ON "cash_movements"("tenant_id");

-- CreateIndex
CREATE INDEX "customers_tenant_id_idx" ON "customers"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenant_id_phone_key" ON "customers"("tenant_id", "phone");

-- CreateIndex
CREATE INDEX "cashback_transactions_tenant_id_idx" ON "cashback_transactions"("tenant_id");

-- CreateIndex
CREATE INDEX "cashback_transactions_customer_id_idx" ON "cashback_transactions"("customer_id");

-- CreateIndex
CREATE INDEX "ingredients_tenant_id_idx" ON "ingredients"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "ingredients_tenant_id_sku_key" ON "ingredients"("tenant_id", "sku");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_idx" ON "stock_movements"("tenant_id");

-- CreateIndex
CREATE INDEX "stock_movements_ingredient_id_idx" ON "stock_movements"("ingredient_id");

-- CreateIndex
CREATE INDEX "product_recipe_ingredients_tenant_id_idx" ON "product_recipe_ingredients"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_recipe_ingredients_product_id_ingredient_id_key" ON "product_recipe_ingredients"("product_id", "ingredient_id");

-- CreateIndex
CREATE INDEX "complement_recipe_ingredients_tenant_id_idx" ON "complement_recipe_ingredients"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "complement_recipe_ingredients_complement_item_id_ingredient_key" ON "complement_recipe_ingredients"("complement_item_id", "ingredient_id");

-- CreateIndex
CREATE INDEX "combo_recipe_ingredients_tenant_id_idx" ON "combo_recipe_ingredients"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "combo_recipe_ingredients_combo_id_ingredient_id_key" ON "combo_recipe_ingredients"("combo_id", "ingredient_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_coverage_configs_tenant_id_key" ON "delivery_coverage_configs"("tenant_id");

-- CreateIndex
CREATE INDEX "delivery_coverage_configs_tenant_id_idx" ON "delivery_coverage_configs"("tenant_id");

-- CreateIndex
CREATE INDEX "delivery_rate_rules_tenant_id_idx" ON "delivery_rate_rules"("tenant_id");

-- CreateIndex
CREATE INDEX "delivery_rate_rules_tenant_id_type_idx" ON "delivery_rate_rules"("tenant_id", "type");

-- CreateIndex
CREATE INDEX "delivery_rate_rules_tenant_id_priority_idx" ON "delivery_rate_rules"("tenant_id", "priority");

-- CreateIndex
CREATE INDEX "delivery_rate_rules_tenant_id_type_neighborhood_idx" ON "delivery_rate_rules"("tenant_id", "type", "neighborhood");

-- CreateIndex
CREATE INDEX "delivery_rate_distance_tiers_tenant_id_idx" ON "delivery_rate_distance_tiers"("tenant_id");

-- CreateIndex
CREATE INDEX "delivery_rate_distance_tiers_delivery_rate_rule_id_idx" ON "delivery_rate_distance_tiers"("delivery_rate_rule_id");

-- CreateIndex
CREATE INDEX "tenant_module_access_tenant_id_idx" ON "tenant_module_access"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_module_access_tenant_id_module_key" ON "tenant_module_access"("tenant_id", "module");

-- CreateIndex
CREATE INDEX "goals_tenant_id_idx" ON "goals"("tenant_id");

-- CreateIndex
CREATE INDEX "customer_otps_tenant_id_phone_idx" ON "customer_otps"("tenant_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "dine_in_tables_active_order_id_key" ON "dine_in_tables"("active_order_id");

-- CreateIndex
CREATE INDEX "dine_in_tables_tenant_id_idx" ON "dine_in_tables"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "dine_in_tables_tenant_id_name_key" ON "dine_in_tables"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "print_jobs_tenant_id_status_idx" ON "print_jobs"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "time_slots_tenant_id_start_time_idx" ON "time_slots"("tenant_id", "start_time");

-- CreateIndex
CREATE INDEX "scheduled_orders_tenant_id_scheduled_for_idx" ON "scheduled_orders"("tenant_id", "scheduled_for");

-- CreateIndex
CREATE INDEX "suppliers_tenant_id_idx" ON "suppliers"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tenant_id_cnpj_key" ON "suppliers"("tenant_id", "cnpj");

-- CreateIndex
CREATE INDEX "purchases_tenant_id_idx" ON "purchases"("tenant_id");

-- CreateIndex
CREATE INDEX "purchases_supplier_id_idx" ON "purchases"("supplier_id");

-- CreateIndex
CREATE INDEX "purchase_items_purchase_id_idx" ON "purchase_items"("purchase_id");

-- CreateIndex
CREATE INDEX "purchase_items_ingredient_id_idx" ON "purchase_items"("ingredient_id");

-- CreateIndex
CREATE INDEX "inventory_counts_tenant_id_idx" ON "inventory_counts"("tenant_id");

-- CreateIndex
CREATE INDEX "inventory_count_items_inventory_count_id_idx" ON "inventory_count_items"("inventory_count_id");

-- CreateIndex
CREATE INDEX "inventory_count_items_ingredient_id_idx" ON "inventory_count_items"("ingredient_id");

-- CreateIndex
CREATE INDEX "financial_accounts_tenant_id_idx" ON "financial_accounts"("tenant_id");

-- CreateIndex
CREATE INDEX "financial_transactions_tenant_id_idx" ON "financial_transactions"("tenant_id");

-- CreateIndex
CREATE INDEX "financial_transactions_account_id_idx" ON "financial_transactions"("account_id");

-- CreateIndex
CREATE INDEX "financial_transactions_due_date_idx" ON "financial_transactions"("due_date");

-- CreateIndex
CREATE INDEX "order_splits_tenant_id_idx" ON "order_splits"("tenant_id");

-- CreateIndex
CREATE INDEX "order_splits_order_id_idx" ON "order_splits"("order_id");

-- CreateIndex
CREATE INDEX "split_payments_tenant_id_idx" ON "split_payments"("tenant_id");

-- CreateIndex
CREATE INDEX "split_payments_order_split_id_idx" ON "split_payments"("order_split_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_instances_tenant_id_key" ON "whatsapp_instances"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_instances_instance_name_key" ON "whatsapp_instances"("instance_name");

-- CreateIndex
CREATE INDEX "chat_sessions_tenant_id_idx" ON "chat_sessions"("tenant_id");

-- CreateIndex
CREATE INDEX "chat_sessions_tenant_id_state_idx" ON "chat_sessions"("tenant_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "chat_sessions_tenant_id_customer_phone_key" ON "chat_sessions"("tenant_id", "customer_phone");

-- CreateIndex
CREATE UNIQUE INDEX "chat_messages_external_id_key" ON "chat_messages"("external_id");

-- CreateIndex
CREATE INDEX "chat_messages_session_id_idx" ON "chat_messages"("session_id");

-- CreateIndex
CREATE INDEX "chat_messages_external_id_idx" ON "chat_messages"("external_id");

-- CreateIndex
CREATE UNIQUE INDEX "ai_agent_configs_tenant_id_key" ON "ai_agent_configs"("tenant_id");

-- CreateIndex
CREATE INDEX "campaigns_tenant_id_idx" ON "campaigns"("tenant_id");

-- CreateIndex
CREATE INDEX "campaigns_tenant_id_status_idx" ON "campaigns"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "campaign_dispatches_campaign_id_idx" ON "campaign_dispatches"("campaign_id");

-- CreateIndex
CREATE INDEX "campaign_dispatches_customer_id_idx" ON "campaign_dispatches"("customer_id");

-- CreateIndex
CREATE INDEX "campaign_dispatches_campaign_id_status_idx" ON "campaign_dispatches"("campaign_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "customer_opt_outs_tenant_id_phone_key" ON "customer_opt_outs"("tenant_id", "phone");

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_business_group_id_fkey" FOREIGN KEY ("business_group_id") REFERENCES "business_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_onboardings" ADD CONSTRAINT "tenant_onboardings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_groups" ADD CONSTRAINT "option_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_items" ADD CONSTRAINT "option_items_option_group_id_fkey" FOREIGN KEY ("option_group_id") REFERENCES "option_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_items" ADD CONSTRAINT "option_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_option_item_prices" ADD CONSTRAINT "product_option_item_prices_option_item_id_fkey" FOREIGN KEY ("option_item_id") REFERENCES "option_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_option_item_prices" ADD CONSTRAINT "product_option_item_prices_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_option_item_prices" ADD CONSTRAINT "product_option_item_prices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_option_group_links" ADD CONSTRAINT "product_option_group_links_option_group_id_fkey" FOREIGN KEY ("option_group_id") REFERENCES "option_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_option_group_links" ADD CONSTRAINT "product_option_group_links_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_option_group_links" ADD CONSTRAINT "product_option_group_links_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_publications" ADD CONSTRAINT "catalog_publications_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_publications" ADD CONSTRAINT "catalog_publications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_availability_rules" ADD CONSTRAINT "catalog_availability_rules_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "catalog_publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "catalog_availability_rules" ADD CONSTRAINT "catalog_availability_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_slots" ADD CONSTRAINT "combo_slots_combo_product_id_fkey" FOREIGN KEY ("combo_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_slots" ADD CONSTRAINT "combo_slots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_slot_allowed_items" ADD CONSTRAINT "combo_slot_allowed_items_combo_slot_id_fkey" FOREIGN KEY ("combo_slot_id") REFERENCES "combo_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_slot_allowed_items" ADD CONSTRAINT "combo_slot_allowed_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_slot_allowed_items" ADD CONSTRAINT "combo_slot_allowed_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_operating_hours" ADD CONSTRAINT "tenant_operating_hours_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_roles" ADD CONSTRAINT "tenant_roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_role_permissions" ADD CONSTRAINT "tenant_role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "tenant_permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_role_permissions" ADD CONSTRAINT "tenant_role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "tenant_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_user_roles" ADD CONSTRAINT "tenant_user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "tenant_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_user_roles" ADD CONSTRAINT "tenant_user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "tenant_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_role_permissions" ADD CONSTRAINT "admin_role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "admin_permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_role_permissions" ADD CONSTRAINT "admin_role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "admin_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "admin_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_user_roles" ADD CONSTRAINT "admin_user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_bundle_items" ADD CONSTRAINT "combo_bundle_items_combo_product_id_fkey" FOREIGN KEY ("combo_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_bundle_items" ADD CONSTRAINT "combo_bundle_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_bundle_items" ADD CONSTRAINT "combo_bundle_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_complement_groups" ADD CONSTRAINT "product_complement_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_complement_items" ADD CONSTRAINT "product_complement_items_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "product_complement_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_complement_items" ADD CONSTRAINT "product_complement_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_complement_group_links" ADD CONSTRAINT "product_complement_group_links_complement_group_id_fkey" FOREIGN KEY ("complement_group_id") REFERENCES "product_complement_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_complement_group_links" ADD CONSTRAINT "product_complement_group_links_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_complement_group_links" ADD CONSTRAINT "product_complement_group_links_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_combos" ADD CONSTRAINT "product_combos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_combo_blocks" ADD CONSTRAINT "product_combo_blocks_combo_id_fkey" FOREIGN KEY ("combo_id") REFERENCES "product_combos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_combo_blocks" ADD CONSTRAINT "product_combo_blocks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_combo_block_items" ADD CONSTRAINT "product_combo_block_items_block_id_fkey" FOREIGN KEY ("block_id") REFERENCES "product_combo_blocks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_combo_block_items" ADD CONSTRAINT "product_combo_block_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_combo_block_items" ADD CONSTRAINT "product_combo_block_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upsells" ADD CONSTRAINT "upsells_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upsell_items" ADD CONSTRAINT "upsell_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upsell_items" ADD CONSTRAINT "upsell_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "upsell_items" ADD CONSTRAINT "upsell_items_upsell_id_fkey" FOREIGN KEY ("upsell_id") REFERENCES "upsells"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_upsells" ADD CONSTRAINT "product_upsells_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_upsells" ADD CONSTRAINT "product_upsells_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_upsells" ADD CONSTRAINT "product_upsells_upsell_id_fkey" FOREIGN KEY ("upsell_id") REFERENCES "upsells"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_driver_id_fkey" FOREIGN KEY ("delivery_driver_id") REFERENCES "delivery_drivers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_waiter_id_fkey" FOREIGN KEY ("waiter_id") REFERENCES "tenant_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_source_upsell_id_fkey" FOREIGN KEY ("source_upsell_id") REFERENCES "upsells"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_complements" ADD CONSTRAINT "order_item_complements_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_complements" ADD CONSTRAINT "order_item_complements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_combo_selections" ADD CONSTRAINT "order_item_combo_selections_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_combo_selections" ADD CONSTRAINT "order_item_combo_selections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_delivery_addresses" ADD CONSTRAINT "order_delivery_addresses_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_delivery_addresses" ADD CONSTRAINT "order_delivery_addresses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_timelines" ADD CONSTRAINT "order_timelines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_timelines" ADD CONSTRAINT "order_timelines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_drivers" ADD CONSTRAINT "delivery_drivers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_driver_locations" ADD CONSTRAINT "delivery_driver_locations_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "delivery_drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_driver_locations" ADD CONSTRAINT "delivery_driver_locations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantSubscription" ADD CONSTRAINT "TenantSubscription_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantSubscription" ADD CONSTRAINT "TenantSubscription_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentTransaction" ADD CONSTRAINT "PaymentTransaction_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderCoupon" ADD CONSTRAINT "OrderCoupon_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderCoupon" ADD CONSTRAINT "OrderCoupon_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_operator_id_fkey" FOREIGN KEY ("operator_id") REFERENCES "tenant_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashback_transactions" ADD CONSTRAINT "cashback_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashback_transactions" ADD CONSTRAINT "cashback_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashback_transactions" ADD CONSTRAINT "cashback_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_recipe_ingredients" ADD CONSTRAINT "product_recipe_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_recipe_ingredients" ADD CONSTRAINT "product_recipe_ingredients_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_recipe_ingredients" ADD CONSTRAINT "product_recipe_ingredients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complement_recipe_ingredients" ADD CONSTRAINT "complement_recipe_ingredients_complement_item_id_fkey" FOREIGN KEY ("complement_item_id") REFERENCES "product_complement_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complement_recipe_ingredients" ADD CONSTRAINT "complement_recipe_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complement_recipe_ingredients" ADD CONSTRAINT "complement_recipe_ingredients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_recipe_ingredients" ADD CONSTRAINT "combo_recipe_ingredients_combo_id_fkey" FOREIGN KEY ("combo_id") REFERENCES "product_combos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_recipe_ingredients" ADD CONSTRAINT "combo_recipe_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combo_recipe_ingredients" ADD CONSTRAINT "combo_recipe_ingredients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_coverage_configs" ADD CONSTRAINT "delivery_coverage_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_rate_rules" ADD CONSTRAINT "delivery_rate_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_rate_distance_tiers" ADD CONSTRAINT "delivery_rate_distance_tiers_delivery_rate_rule_id_fkey" FOREIGN KEY ("delivery_rate_rule_id") REFERENCES "delivery_rate_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_rate_distance_tiers" ADD CONSTRAINT "delivery_rate_distance_tiers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_module_access" ADD CONSTRAINT "tenant_module_access_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_otps" ADD CONSTRAINT "customer_otps_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dine_in_tables" ADD CONSTRAINT "dine_in_tables_active_order_id_fkey" FOREIGN KEY ("active_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dine_in_tables" ADD CONSTRAINT "dine_in_tables_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_slots" ADD CONSTRAINT "time_slots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_orders" ADD CONSTRAINT "scheduled_orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_orders" ADD CONSTRAINT "scheduled_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_orders" ADD CONSTRAINT "scheduled_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_orders" ADD CONSTRAINT "scheduled_orders_time_slot_id_fkey" FOREIGN KEY ("time_slot_id") REFERENCES "time_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_inventory_count_id_fkey" FOREIGN KEY ("inventory_count_id") REFERENCES "inventory_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_items" ADD CONSTRAINT "inventory_count_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_splits" ADD CONSTRAINT "order_splits_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_splits" ADD CONSTRAINT "order_splits_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split_payments" ADD CONSTRAINT "split_payments_order_split_id_fkey" FOREIGN KEY ("order_split_id") REFERENCES "order_splits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split_payments" ADD CONSTRAINT "split_payments_payment_tx_id_fkey" FOREIGN KEY ("payment_tx_id") REFERENCES "PaymentTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split_payments" ADD CONSTRAINT "split_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_instances" ADD CONSTRAINT "whatsapp_instances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_configs" ADD CONSTRAINT "ai_agent_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_dispatches" ADD CONSTRAINT "campaign_dispatches_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_dispatches" ADD CONSTRAINT "campaign_dispatches_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_opt_outs" ADD CONSTRAINT "customer_opt_outs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_opt_outs" ADD CONSTRAINT "customer_opt_outs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
