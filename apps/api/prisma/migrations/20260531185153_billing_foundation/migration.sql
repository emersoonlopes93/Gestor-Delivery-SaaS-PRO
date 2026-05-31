-- CreateEnum
CREATE TYPE "BillingPlanType" AS ENUM ('fixed', 'revenue_tiered', 'hybrid', 'custom');

-- CreateEnum
CREATE TYPE "BillingCycleInterval" AS ENUM ('monthly', 'yearly');

-- CreateEnum
CREATE TYPE "TenantSubscriptionStatus" AS ENUM ('trialing', 'active', 'past_due', 'grace_period', 'suspended', 'canceled');

-- CreateEnum
CREATE TYPE "BillingCycleStatus" AS ENUM ('open', 'closed', 'invoiced', 'paid', 'failed', 'void');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'open', 'paid', 'failed', 'void', 'overdue');

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('pending', 'processing', 'succeeded', 'failed', 'canceled');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('asaas', 'mercado_pago', 'stripe', 'manual');

-- CreateEnum
CREATE TYPE "BillingAddonPricingType" AS ENUM ('fixed', 'percentage', 'usage_based');

-- AlterEnum
ALTER TYPE "ChatState" ADD VALUE 'expired';

-- DropIndex
DROP INDEX "chat_sessions_tenant_id_customer_phone_key";

-- AlterTable
ALTER TABLE "chat_sessions" ADD COLUMN     "close_reason" TEXT,
ADD COLUMN     "expires_at" TIMESTAMP(3),
ADD COLUMN     "last_agent_message_at" TIMESTAMP(3),
ADD COLUMN     "last_customer_message_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BillingPlan" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "description" VARCHAR(255),
    "type" "BillingPlanType" NOT NULL DEFAULT 'revenue_tiered',
    "cycle_interval" "BillingCycleInterval" NOT NULL DEFAULT 'monthly',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_public" BOOLEAN NOT NULL DEFAULT false,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "trial_days" INTEGER NOT NULL DEFAULT 7,
    "requires_payment_method" BOOLEAN NOT NULL DEFAULT false,
    "allow_all_modules" BOOLEAN NOT NULL DEFAULT false,
    "included_modules_limit" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_revenue_tiers" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "min_revenue" DECIMAL(12,2) NOT NULL,
    "max_revenue" DECIMAL(12,2),
    "price" DECIMAL(12,2) NOT NULL,
    "label" VARCHAR(100),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_revenue_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_plan_modules" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "module_key" VARCHAR(100) NOT NULL,
    "is_included" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_plan_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_module_addons" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT,
    "module_key" VARCHAR(100) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(255),
    "pricing_type" "BillingAddonPricingType" NOT NULL DEFAULT 'fixed',
    "price" DECIMAL(12,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_module_addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_billing_subscriptions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "billing_plan_id" TEXT NOT NULL,
    "status" "TenantSubscriptionStatus" NOT NULL DEFAULT 'trialing',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trial_started_at" TIMESTAMP(3),
    "trial_ends_at" TIMESTAMP(3),
    "current_cycle_started_at" TIMESTAMP(3),
    "current_cycle_ends_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "suspended_at" TIMESTAMP(3),
    "grace_period_ends_at" TIMESTAMP(3),
    "requires_payment_method" BOOLEAN NOT NULL DEFAULT false,
    "provider" "PaymentProvider",
    "provider_customer_id" TEXT,
    "provider_subscription_id" TEXT,
    "legacy_tenant_subscription_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_billing_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_cycles" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "status" "BillingCycleStatus" NOT NULL DEFAULT 'open',
    "measured_revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "billable_revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "selected_tier_id" TEXT,
    "base_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "addons_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_usage_snapshots" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "cycle_id" TEXT,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "source_channel" TEXT,
    "orders_count" INTEGER NOT NULL DEFAULT 0,
    "gross_orders_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discounts_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "delivery_fee_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "service_fee_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "billable_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_usage_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "cycle_id" TEXT,
    "number" VARCHAR(80) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "due_date" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "provider" "PaymentProvider" NOT NULL DEFAULT 'manual',
    "provider_invoice_id" TEXT,
    "provider_payment_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "description" VARCHAR(255) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_amount" DECIMAL(12,2) NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_payment_methods" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "provider_customer_id" TEXT,
    "provider_payment_method_id" TEXT,
    "brand" VARCHAR(50),
    "last4" VARCHAR(4),
    "holder_name" VARCHAR(100),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'pending',
    "amount" DECIMAL(12,2) NOT NULL,
    "error_code" TEXT,
    "error_message" TEXT,
    "provider_payment_id" TEXT,
    "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_settings" (
    "id" TEXT NOT NULL,
    "include_delivery_fee_by_default" BOOLEAN NOT NULL DEFAULT false,
    "include_service_fee_by_default" BOOLEAN NOT NULL DEFAULT false,
    "count_storefront_orders" BOOLEAN NOT NULL DEFAULT true,
    "count_pos_orders" BOOLEAN NOT NULL DEFAULT true,
    "count_whatsapp_ai_orders" BOOLEAN NOT NULL DEFAULT true,
    "count_manual_orders" BOOLEAN NOT NULL DEFAULT false,
    "count_confirmed_orders" BOOLEAN NOT NULL DEFAULT true,
    "count_completed_orders" BOOLEAN NOT NULL DEFAULT true,
    "exclude_cancelled_orders" BOOLEAN NOT NULL DEFAULT true,
    "discount_reduces_revenue" BOOLEAN NOT NULL DEFAULT true,
    "default_grace_period_days" INTEGER NOT NULL DEFAULT 7,
    "default_trial_days" INTEGER NOT NULL DEFAULT 7,
    "require_payment_method_for_paid_plans" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingPlan_slug_key" ON "BillingPlan"("slug");

-- CreateIndex
CREATE INDEX "billing_revenue_tiers_plan_id_sort_order_idx" ON "billing_revenue_tiers"("plan_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "billing_revenue_tiers_plan_id_sort_order_key" ON "billing_revenue_tiers"("plan_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "billing_plan_modules_plan_id_module_key_key" ON "billing_plan_modules"("plan_id", "module_key");

-- CreateIndex
CREATE INDEX "tenant_billing_subscriptions_tenant_id_idx" ON "tenant_billing_subscriptions"("tenant_id");

-- CreateIndex
CREATE INDEX "tenant_billing_subscriptions_billing_plan_id_idx" ON "tenant_billing_subscriptions"("billing_plan_id");

-- CreateIndex
CREATE INDEX "tenant_billing_subscriptions_status_idx" ON "tenant_billing_subscriptions"("status");

-- CreateIndex
CREATE INDEX "tenant_billing_subscriptions_current_cycle_started_at_curre_idx" ON "tenant_billing_subscriptions"("current_cycle_started_at", "current_cycle_ends_at");

-- CreateIndex
CREATE INDEX "billing_cycles_tenant_id_idx" ON "billing_cycles"("tenant_id");

-- CreateIndex
CREATE INDEX "billing_cycles_subscription_id_idx" ON "billing_cycles"("subscription_id");

-- CreateIndex
CREATE INDEX "billing_usage_snapshots_tenant_id_idx" ON "billing_usage_snapshots"("tenant_id");

-- CreateIndex
CREATE INDEX "billing_usage_snapshots_cycle_id_idx" ON "billing_usage_snapshots"("cycle_id");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_idx" ON "invoices"("tenant_id");

-- CreateIndex
CREATE INDEX "invoices_subscription_id_idx" ON "invoices"("subscription_id");

-- CreateIndex
CREATE INDEX "invoices_cycle_id_idx" ON "invoices"("cycle_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");

-- CreateIndex
CREATE INDEX "billing_payment_methods_tenant_id_idx" ON "billing_payment_methods"("tenant_id");

-- CreateIndex
CREATE INDEX "payment_attempts_tenant_id_idx" ON "payment_attempts"("tenant_id");

-- CreateIndex
CREATE INDEX "payment_attempts_invoice_id_idx" ON "payment_attempts"("invoice_id");

-- AddForeignKey
ALTER TABLE "billing_revenue_tiers" ADD CONSTRAINT "billing_revenue_tiers_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "BillingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_plan_modules" ADD CONSTRAINT "billing_plan_modules_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "BillingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_module_addons" ADD CONSTRAINT "billing_module_addons_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "BillingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_billing_subscriptions" ADD CONSTRAINT "tenant_billing_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_billing_subscriptions" ADD CONSTRAINT "tenant_billing_subscriptions_legacy_tenant_subscription_id_fkey" FOREIGN KEY ("legacy_tenant_subscription_id") REFERENCES "TenantSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_billing_subscriptions" ADD CONSTRAINT "tenant_billing_subscriptions_billing_plan_id_fkey" FOREIGN KEY ("billing_plan_id") REFERENCES "BillingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_cycles" ADD CONSTRAINT "billing_cycles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_cycles" ADD CONSTRAINT "billing_cycles_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "tenant_billing_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_cycles" ADD CONSTRAINT "billing_cycles_selected_tier_id_fkey" FOREIGN KEY ("selected_tier_id") REFERENCES "billing_revenue_tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_usage_snapshots" ADD CONSTRAINT "billing_usage_snapshots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_usage_snapshots" ADD CONSTRAINT "billing_usage_snapshots_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "billing_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "tenant_billing_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_cycle_id_fkey" FOREIGN KEY ("cycle_id") REFERENCES "billing_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_payment_methods" ADD CONSTRAINT "billing_payment_methods_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
