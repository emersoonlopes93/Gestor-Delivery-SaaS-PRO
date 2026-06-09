CREATE TYPE "LoyaltyTransactionType" AS ENUM ('earned', 'redeemed', 'adjusted', 'expired');
CREATE TYPE "WalletTransactionType" AS ENUM ('credit', 'debit', 'expired', 'refunded');

ALTER TABLE "tenant_settings"
  ADD COLUMN "loyalty_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "loyalty_points_per_real" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  ADD COLUMN "cashback_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "cashback_percent" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
  ADD COLUMN "cashback_validity_days" INTEGER NOT NULL DEFAULT 90,
  ADD COLUMN "gamification_enabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "customers"
  ADD COLUMN "birth_date" TIMESTAMP(3);

ALTER TABLE "cashback_transactions"
  ADD COLUMN "expires_at" TIMESTAMP(3);

CREATE TABLE "customer_loyalty_transactions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "order_id" TEXT,
  "type" "LoyaltyTransactionType" NOT NULL,
  "points" INTEGER NOT NULL,
  "description" VARCHAR(255),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_loyalty_transactions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "customer_wallet_transactions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "order_id" TEXT,
  "type" "WalletTransactionType" NOT NULL,
  "source" VARCHAR(40) NOT NULL DEFAULT 'manual',
  "amount" DECIMAL(10,2) NOT NULL,
  "description" VARCHAR(255),
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "customer_wallet_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_loyalty_transactions_tenant_id_idx" ON "customer_loyalty_transactions"("tenant_id");
CREATE INDEX "customer_loyalty_transactions_customer_id_idx" ON "customer_loyalty_transactions"("customer_id");
CREATE INDEX "customer_wallet_transactions_tenant_id_idx" ON "customer_wallet_transactions"("tenant_id");
CREATE INDEX "customer_wallet_transactions_customer_id_idx" ON "customer_wallet_transactions"("customer_id");

ALTER TABLE "customer_loyalty_transactions"
  ADD CONSTRAINT "customer_loyalty_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_loyalty_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_loyalty_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_wallet_transactions"
  ADD CONSTRAINT "customer_wallet_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_wallet_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "customer_wallet_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
