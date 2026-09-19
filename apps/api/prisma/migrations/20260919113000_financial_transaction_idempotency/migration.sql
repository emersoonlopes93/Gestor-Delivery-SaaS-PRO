ALTER TABLE "financial_transactions"
ADD COLUMN "idempotency_key" VARCHAR(120);

CREATE UNIQUE INDEX "financial_transactions_tenant_idempotency_key"
ON "financial_transactions"("tenant_id", "idempotency_key");
