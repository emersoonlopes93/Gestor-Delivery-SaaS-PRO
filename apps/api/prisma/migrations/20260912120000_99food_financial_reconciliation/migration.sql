-- 99Food financial reconciliation. Additive only; no historical or heuristic backfill.
CREATE TYPE "MarketplaceSettlementStatus" AS ENUM (
  'LIQUIDATED_UNPOSTED',
  'POSTED',
  'RECONCILIATION_DISCREPANCY'
);

ALTER TABLE "marketplace_connections"
  ADD COLUMN "settlement_financial_account_id" TEXT;

CREATE TABLE "marketplace_bill_entries" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "provider" "MarketplaceProvider" NOT NULL,
  "connection_id" TEXT NOT NULL,
  "order_id" VARCHAR(120) NOT NULL,
  "order_type" INTEGER NOT NULL,
  "business_ts" VARCHAR(120) NOT NULL,
  "business_at" TIMESTAMP(3),
  "day_payment_id" VARCHAR(120) NOT NULL,
  "commission_amount" BIGINT NOT NULL,
  "settlement_amount" BIGINT NOT NULL,
  "order_amount" BIGINT NOT NULL,
  "shop_activity_outcome" BIGINT NOT NULL,
  "shop_activity_subsidy" BIGINT NOT NULL,
  "expect_settle_date" TIMESTAMP(3),
  "raw_payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "marketplace_bill_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "marketplace_settlements" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "provider" "MarketplaceProvider" NOT NULL,
  "connection_id" TEXT NOT NULL,
  "week_payment_id" VARCHAR(120) NOT NULL,
  "withdraw_amount" BIGINT NOT NULL,
  "withdraw_date" TIMESTAMP(3) NOT NULL,
  "liability" BIGINT NOT NULL DEFAULT 0,
  "shop_id" VARCHAR(120) NOT NULL,
  "settle_start_date" TIMESTAMP(3) NOT NULL,
  "settle_end_date" TIMESTAMP(3) NOT NULL,
  "currency" VARCHAR(12) NOT NULL,
  "status" "MarketplaceSettlementStatus" NOT NULL DEFAULT 'LIQUIDATED_UNPOSTED',
  "financial_transaction_id" TEXT,
  "posted_at" TIMESTAMP(3),
  "composition_difference" BIGINT,
  "discrepancy_details" JSONB,
  "raw_payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "marketplace_settlements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "marketplace_settlement_day_payments" (
  "id" TEXT NOT NULL,
  "settlement_id" TEXT NOT NULL,
  "day_payment_id" VARCHAR(120) NOT NULL,
  CONSTRAINT "marketplace_settlement_day_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketplace_bill_entry_identity_key"
  ON "marketplace_bill_entries"("tenant_id", "provider", "connection_id", "order_id", "order_type", "business_ts");
CREATE INDEX "marketplace_bill_entry_day_payment_idx"
  ON "marketplace_bill_entries"("tenant_id", "provider", "connection_id", "day_payment_id");
CREATE INDEX "marketplace_bill_entry_business_at_idx"
  ON "marketplace_bill_entries"("tenant_id", "provider", "connection_id", "business_at");

CREATE UNIQUE INDEX "marketplace_settlement_identity_key"
  ON "marketplace_settlements"("tenant_id", "provider", "week_payment_id");
CREATE UNIQUE INDEX "marketplace_settlements_financial_transaction_id_key"
  ON "marketplace_settlements"("financial_transaction_id");
CREATE INDEX "marketplace_settlement_withdraw_date_idx"
  ON "marketplace_settlements"("tenant_id", "provider", "connection_id", "withdraw_date");
CREATE INDEX "marketplace_settlement_status_idx"
  ON "marketplace_settlements"("tenant_id", "status");

CREATE UNIQUE INDEX "marketplace_settlement_day_payment_key"
  ON "marketplace_settlement_day_payments"("settlement_id", "day_payment_id");
CREATE INDEX "marketplace_settlement_day_payment_idx"
  ON "marketplace_settlement_day_payments"("day_payment_id");

ALTER TABLE "marketplace_connections"
  ADD CONSTRAINT "marketplace_connections_settlement_financial_account_id_fkey"
  FOREIGN KEY ("settlement_financial_account_id") REFERENCES "financial_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "marketplace_bill_entries"
  ADD CONSTRAINT "marketplace_bill_entries_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_bill_entries"
  ADD CONSTRAINT "marketplace_bill_entries_connection_id_fkey"
  FOREIGN KEY ("connection_id") REFERENCES "marketplace_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_settlements"
  ADD CONSTRAINT "marketplace_settlements_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_settlements"
  ADD CONSTRAINT "marketplace_settlements_connection_id_fkey"
  FOREIGN KEY ("connection_id") REFERENCES "marketplace_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_settlements"
  ADD CONSTRAINT "marketplace_settlements_financial_transaction_id_fkey"
  FOREIGN KEY ("financial_transaction_id") REFERENCES "financial_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "marketplace_settlement_day_payments"
  ADD CONSTRAINT "marketplace_settlement_day_payments_settlement_id_fkey"
  FOREIGN KEY ("settlement_id") REFERENCES "marketplace_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
