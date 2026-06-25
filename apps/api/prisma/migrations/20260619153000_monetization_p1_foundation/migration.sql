-- Monetization P1 foundation: explicit Trial Pro settings, AI add-on activation, partner links.

CREATE TYPE "TenantAddonStatus" AS ENUM ('active', 'scheduled_cancel', 'canceled');

ALTER TABLE "billing_module_addons"
ADD COLUMN "addon_key" TEXT NOT NULL DEFAULT 'addon';

UPDATE "billing_module_addons"
SET "addon_key" = CASE
  WHEN "module_key" = 'ai_agent' THEN 'ai_agent'
  ELSE "module_key"
END;

CREATE UNIQUE INDEX "billing_module_addons_addon_key_key"
ON "billing_module_addons"("addon_key");

CREATE TABLE "tenant_addons" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "addon_key" TEXT NOT NULL,
  "billing_addon_id" TEXT,
  "status" "TenantAddonStatus" NOT NULL DEFAULT 'active',
  "price" DECIMAL(12,2) NOT NULL,
  "cancel_at_cycle_end" BOOLEAN NOT NULL DEFAULT true,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "current_period_ends_at" TIMESTAMP(3),
  "canceled_at" TIMESTAMP(3),
  "metadata_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tenant_addons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_addons_tenant_id_addon_key_key"
ON "tenant_addons"("tenant_id", "addon_key");

CREATE INDEX "tenant_addons_tenant_id_status_idx"
ON "tenant_addons"("tenant_id", "status");

ALTER TABLE "tenant_addons"
ADD CONSTRAINT "tenant_addons_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tenant_addons"
ADD CONSTRAINT "tenant_addons_billing_addon_id_fkey"
FOREIGN KEY ("billing_addon_id") REFERENCES "billing_module_addons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "billing_settings"
ADD COLUMN "trial_pro_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "trial_includes_ai" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "trial_includes_ifood" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "trial_includes_advanced_reports" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "trial_auto_convert_to_billing" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "ai_included_for_paid_tenants" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "ai_included_monthly_messages" INTEGER NOT NULL DEFAULT 200,
ADD COLUMN "ai_free_trial_messages" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "ai_hard_limit_monthly_messages" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN "partner_links_json" JSONB;

