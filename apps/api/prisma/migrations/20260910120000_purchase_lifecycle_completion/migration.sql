-- Purchase lifecycle: additive nullable linkage for existing rows, with no heuristic backfill.
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'purchase_reversal';

ALTER TABLE "purchases"
  ADD COLUMN "idempotency_key" VARCHAR(100),
  ADD COLUMN "idempotency_fingerprint" VARCHAR(64),
  ADD COLUMN "cancelled_at" TIMESTAMP(3);

ALTER TABLE "stock_movements"
  ADD COLUMN "purchase_id" TEXT,
  ADD COLUMN "purchase_item_id" TEXT;

ALTER TABLE "financial_transactions"
  ADD COLUMN "reversal_of_transaction_id" TEXT;

CREATE TABLE "purchase_settlements" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "purchase_id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "financial_transaction_id" TEXT NOT NULL,
  "paid_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversed_at" TIMESTAMP(3),
  "reversal_transaction_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "purchase_settlements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "purchases_tenant_id_idempotency_key_key"
  ON "purchases"("tenant_id", "idempotency_key");
CREATE UNIQUE INDEX "stock_movements_purchase_item_id_key"
  ON "stock_movements"("purchase_item_id");
CREATE INDEX "stock_movements_tenant_id_purchase_id_type_idx"
  ON "stock_movements"("tenant_id", "purchase_id", "type");
CREATE UNIQUE INDEX "financial_transactions_reversal_of_transaction_id_key"
  ON "financial_transactions"("reversal_of_transaction_id");
CREATE UNIQUE INDEX "purchase_settlements_purchase_id_key"
  ON "purchase_settlements"("purchase_id");
CREATE UNIQUE INDEX "purchase_settlements_financial_transaction_id_key"
  ON "purchase_settlements"("financial_transaction_id");
CREATE UNIQUE INDEX "purchase_settlements_reversal_transaction_id_key"
  ON "purchase_settlements"("reversal_transaction_id");
CREATE INDEX "purchase_settlements_tenant_id_idx"
  ON "purchase_settlements"("tenant_id");
CREATE INDEX "purchase_settlements_tenant_id_account_id_idx"
  ON "purchase_settlements"("tenant_id", "account_id");

ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_purchase_id_fkey"
  FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_purchase_item_id_fkey"
  FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "financial_transactions"
  ADD CONSTRAINT "financial_transactions_reversal_of_transaction_id_fkey"
  FOREIGN KEY ("reversal_of_transaction_id") REFERENCES "financial_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_settlements"
  ADD CONSTRAINT "purchase_settlements_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_settlements"
  ADD CONSTRAINT "purchase_settlements_purchase_id_fkey"
  FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_settlements"
  ADD CONSTRAINT "purchase_settlements_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "financial_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_settlements"
  ADD CONSTRAINT "purchase_settlements_financial_transaction_id_fkey"
  FOREIGN KEY ("financial_transaction_id") REFERENCES "financial_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_settlements"
  ADD CONSTRAINT "purchase_settlements_reversal_transaction_id_fkey"
  FOREIGN KEY ("reversal_transaction_id") REFERENCES "financial_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
