CREATE TYPE "PlatformFeePolicyScope" AS ENUM ('FREE_TENANT', 'PAID_DEFAULT', 'BILLING_PLAN');
CREATE TYPE "PlatformFeeType" AS ENUM ('FIXED');
CREATE TYPE "PlatformFeeState" AS ENUM ('PENDING', 'EARNED', 'SETTLED', 'REVERSED_BY_PROVIDER', 'DUE_FROM_TENANT', 'WAIVED');
CREATE TYPE "TenantReceivableSourceType" AS ENUM ('PLATFORM_FEE_PROVIDER_REVERSAL');
CREATE TYPE "TenantReceivableStatus" AS ENUM ('OPEN', 'SETTLED', 'WAIVED');
CREATE TYPE "OnlinePaymentActivationStatus" AS ENUM ('NOT_REQUESTED', 'PENDING_TERMS', 'PENDING_ONBOARDING', 'PENDING_KYC', 'ACTIVE', 'SUSPENDED', 'FAILED');

CREATE TABLE "platform_fee_policies" (
  "id" TEXT NOT NULL,
  "selector_key" VARCHAR(180) NOT NULL,
  "scope" "PlatformFeePolicyScope" NOT NULL,
  "billing_plan_id" TEXT,
  "fee_type" "PlatformFeeType" NOT NULL DEFAULT 'FIXED',
  "fixed_amount" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
  "version" INTEGER NOT NULL,
  "effective_from" TIMESTAMP(3) NOT NULL,
  "effective_until" TIMESTAMP(3),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "platform_fee_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_fee_policy_positive_amount" CHECK ("fixed_amount" >= 0),
  CONSTRAINT "platform_fee_policy_brl" CHECK ("currency" = 'BRL'),
  CONSTRAINT "platform_fee_policy_scope_plan" CHECK (("scope" = 'BILLING_PLAN') = ("billing_plan_id" IS NOT NULL))
);

CREATE UNIQUE INDEX "platform_fee_policies_selector_key_version_key" ON "platform_fee_policies"("selector_key", "version");
CREATE INDEX "platform_fee_policy_effective_idx" ON "platform_fee_policies"("selector_key", "active", "effective_from", "effective_until");
CREATE INDEX "platform_fee_policies_billing_plan_id_idx" ON "platform_fee_policies"("billing_plan_id");

INSERT INTO "platform_fee_policies" ("id", "selector_key", "scope", "fixed_amount", "currency", "version", "effective_from", "active", "updated_at") VALUES
  ('00000000-0000-4000-8000-000000000038', 'FREE', 'FREE_TENANT', 0.38, 'BRL', 1, '2026-08-23T00:00:00.000Z', true, CURRENT_TIMESTAMP),
  ('00000000-0000-4000-8000-000000000020', 'PAID_DEFAULT', 'PAID_DEFAULT', 0.20, 'BRL', 1, '2026-08-23T00:00:00.000Z', true, CURRENT_TIMESTAMP);

ALTER TABLE "order_payment_attempts"
  ADD COLUMN "platform_fee_policy_id" TEXT,
  ADD COLUMN "platform_fee_policy_version" INTEGER,
  ADD COLUMN "platform_fee_type" "PlatformFeeType",
  ADD COLUMN "platform_fee_expected_amount" DECIMAL(12,2),
  ADD COLUMN "platform_fee_currency" VARCHAR(3),
  ADD COLUMN "tenant_plan_snapshot" VARCHAR(180);

CREATE INDEX "order_payment_attempts_platform_fee_policy_id_idx" ON "order_payment_attempts"("platform_fee_policy_id");

CREATE TABLE "platform_fee_entries" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "order_payment_attempt_id" TEXT NOT NULL,
  "state" "PlatformFeeState" NOT NULL DEFAULT 'PENDING',
  "expected_amount" DECIMAL(12,2) NOT NULL,
  "actual_collected_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
  "provider_split_allocation_id" VARCHAR(255),
  "external_reference" VARCHAR(255),
  "earned_at" TIMESTAMP(3),
  "settled_at" TIMESTAMP(3),
  "reversed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "platform_fee_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "platform_fee_entry_non_negative" CHECK ("expected_amount" >= 0 AND "actual_collected_amount" >= 0),
  CONSTRAINT "platform_fee_entry_brl" CHECK ("currency" = 'BRL')
);
CREATE UNIQUE INDEX "platform_fee_entries_order_payment_attempt_id_key" ON "platform_fee_entries"("order_payment_attempt_id");
CREATE INDEX "platform_fee_entries_tenant_id_state_idx" ON "platform_fee_entries"("tenant_id", "state");

CREATE TABLE "tenant_receivables" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "source_type" "TenantReceivableSourceType" NOT NULL,
  "source_id" VARCHAR(160) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'BRL',
  "status" "TenantReceivableStatus" NOT NULL DEFAULT 'OPEN',
  "reason" VARCHAR(255) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "settled_at" TIMESTAMP(3),
  CONSTRAINT "tenant_receivables_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_receivable_positive_amount" CHECK ("amount" > 0),
  CONSTRAINT "tenant_receivable_brl" CHECK ("currency" = 'BRL')
);
CREATE UNIQUE INDEX "tenant_receivables_tenant_id_source_type_source_id_key" ON "tenant_receivables"("tenant_id", "source_type", "source_id");
CREATE INDEX "tenant_receivables_tenant_id_status_idx" ON "tenant_receivables"("tenant_id", "status");

CREATE TABLE "online_payment_activations" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "status" "OnlinePaymentActivationStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  "requested_at" TIMESTAMP(3),
  "terms_accepted_at" TIMESTAMP(3),
  "terms_version" VARCHAR(80),
  "terms_accepted_by_user_id" TEXT,
  "onboarding_started_at" TIMESTAMP(3),
  "activated_at" TIMESTAMP(3),
  "suspended_at" TIMESTAMP(3),
  "failure_reason" VARCHAR(255),
  "metadata_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "online_payment_activations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "online_payment_activations_tenant_id_key" ON "online_payment_activations"("tenant_id");
CREATE INDEX "online_payment_activations_status_idx" ON "online_payment_activations"("status");

ALTER TABLE "platform_fee_policies" ADD CONSTRAINT "platform_fee_policies_billing_plan_id_fkey" FOREIGN KEY ("billing_plan_id") REFERENCES "BillingPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "order_payment_attempts" ADD CONSTRAINT "order_payment_attempts_platform_fee_policy_id_fkey" FOREIGN KEY ("platform_fee_policy_id") REFERENCES "platform_fee_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "platform_fee_entries" ADD CONSTRAINT "platform_fee_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "platform_fee_entries" ADD CONSTRAINT "platform_fee_entries_order_payment_attempt_id_fkey" FOREIGN KEY ("order_payment_attempt_id") REFERENCES "order_payment_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tenant_receivables" ADD CONSTRAINT "tenant_receivables_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "online_payment_activations" ADD CONSTRAINT "online_payment_activations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
