-- Billing ledger foundation: auditable revenue events, rule versions, snapshot lineage and status history.

CREATE TYPE "RevenueEventType" AS ENUM (
  'order_confirmed',
  'order_completed',
  'order_cancelled',
  'order_refunded',
  'manual_adjustment',
  'correction'
);

CREATE TYPE "RevenueEventStatus" AS ENUM ('posted', 'voided');

CREATE TABLE "billing_rule_versions" (
  "id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "description" TEXT,
  "included_order_statuses" JSONB NOT NULL,
  "included_channels" JSONB NOT NULL,
  "revenue_event_types" JSONB NOT NULL,
  "tier_config_json" JSONB,
  "effective_from" TIMESTAMP(3) NOT NULL,
  "effective_to" TIMESTAMP(3),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_admin_id" TEXT,

  CONSTRAINT "billing_rule_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "revenue_events" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "order_id" TEXT,
  "idempotency_key" VARCHAR(160) NOT NULL,
  "source" VARCHAR(50) NOT NULL,
  "type" "RevenueEventType" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "billing_period_year" INTEGER NOT NULL,
  "billing_period_month" INTEGER NOT NULL,
  "status" "RevenueEventStatus" NOT NULL DEFAULT 'posted',
  "reason" VARCHAR(255),
  "metadata_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_type" VARCHAR(30) NOT NULL DEFAULT 'system',
  "created_by_id" TEXT,
  "voided_at" TIMESTAMP(3),
  "voided_by_type" VARCHAR(30),
  "voided_by_id" TEXT,
  "void_reason" VARCHAR(255),

  CONSTRAINT "revenue_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "subscription_status_history" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "subscription_id" TEXT NOT NULL,
  "previous_status" "TenantSubscriptionStatus",
  "next_status" "TenantSubscriptionStatus" NOT NULL,
  "reason" VARCHAR(120) NOT NULL,
  "source" VARCHAR(50) NOT NULL,
  "actor_type" VARCHAR(30) NOT NULL,
  "actor_id" TEXT,
  "metadata_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "subscription_status_history_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "billing_usage_snapshots"
  ADD COLUMN "source" VARCHAR(30) NOT NULL DEFAULT 'orders_fallback',
  ADD COLUMN "total_revenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "total_orders" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "total_adjustments" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "billing_rule_version_id" TEXT,
  ADD COLUMN "generated_at" TIMESTAMP(3),
  ADD COLUMN "generated_by" VARCHAR(80),
  ADD COLUMN "checksum" VARCHAR(128);

UPDATE "billing_usage_snapshots"
SET
  "total_revenue" = "billable_amount",
  "total_orders" = "orders_count",
  "generated_at" = "created_at"
WHERE "total_revenue" = 0 AND "total_orders" = 0;

ALTER TABLE "invoices"
  ADD COLUMN "usage_snapshot_id" TEXT,
  ADD COLUMN "billing_rule_version_id" TEXT;

CREATE UNIQUE INDEX "billing_rule_versions_version_key" ON "billing_rule_versions"("version");
CREATE INDEX "billing_rule_versions_is_active_effective_from_effective_to_idx" ON "billing_rule_versions"("is_active", "effective_from", "effective_to");

CREATE UNIQUE INDEX "revenue_events_tenant_id_idempotency_key_key" ON "revenue_events"("tenant_id", "idempotency_key");
CREATE INDEX "revenue_events_tenant_id_billing_period_year_billing_period_month_idx" ON "revenue_events"("tenant_id", "billing_period_year", "billing_period_month");
CREATE INDEX "revenue_events_tenant_id_order_id_idx" ON "revenue_events"("tenant_id", "order_id");
CREATE INDEX "revenue_events_tenant_id_type_idx" ON "revenue_events"("tenant_id", "type");
CREATE INDEX "revenue_events_tenant_id_occurred_at_idx" ON "revenue_events"("tenant_id", "occurred_at");

CREATE INDEX "subscription_status_history_tenant_id_created_at_idx" ON "subscription_status_history"("tenant_id", "created_at");
CREATE INDEX "subscription_status_history_subscription_id_idx" ON "subscription_status_history"("subscription_id");

CREATE INDEX "billing_usage_snapshots_billing_rule_version_id_idx" ON "billing_usage_snapshots"("billing_rule_version_id");
CREATE INDEX "invoices_usage_snapshot_id_idx" ON "invoices"("usage_snapshot_id");
CREATE INDEX "invoices_billing_rule_version_id_idx" ON "invoices"("billing_rule_version_id");

ALTER TABLE "revenue_events" ADD CONSTRAINT "revenue_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "revenue_events" ADD CONSTRAINT "revenue_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscription_status_history" ADD CONSTRAINT "subscription_status_history_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscription_status_history" ADD CONSTRAINT "subscription_status_history_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "tenant_billing_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "billing_usage_snapshots" ADD CONSTRAINT "billing_usage_snapshots_billing_rule_version_id_fkey" FOREIGN KEY ("billing_rule_version_id") REFERENCES "billing_rule_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_usage_snapshot_id_fkey" FOREIGN KEY ("usage_snapshot_id") REFERENCES "billing_usage_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billing_rule_version_id_fkey" FOREIGN KEY ("billing_rule_version_id") REFERENCES "billing_rule_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "billing_rule_versions" (
  "id",
  "version",
  "name",
  "description",
  "included_order_statuses",
  "included_channels",
  "revenue_event_types",
  "tier_config_json",
  "effective_from",
  "is_active"
) VALUES (
  '00000000-0000-4000-8000-000000000001',
  1,
  'Default revenue ledger rule',
  'Conta eventos posted de pedidos completed e ajustes manuais para billing por faturamento.',
  '["completed"]'::jsonb,
  '["storefront","pos","whatsapp_ai","manual"]'::jsonb,
  '["order_completed","manual_adjustment","correction","order_refunded","order_cancelled"]'::jsonb,
  '{}'::jsonb,
  '2026-06-10T00:00:00.000Z',
  true
);
