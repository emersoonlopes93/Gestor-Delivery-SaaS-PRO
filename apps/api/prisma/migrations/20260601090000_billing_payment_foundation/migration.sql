ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'mock';

CREATE TYPE "BillingGatewayMode" AS ENUM ('manual', 'sandbox', 'production');

ALTER TABLE "invoices"
  ADD COLUMN "opened_at" TIMESTAMP(3),
  ADD COLUMN "failed_at" TIMESTAMP(3),
  ADD COLUMN "voided_at" TIMESTAMP(3);

ALTER TABLE "payment_attempts"
  ADD COLUMN "mode" "BillingGatewayMode" NOT NULL DEFAULT 'manual',
  ADD COLUMN "idempotency_key" VARCHAR(160),
  ADD COLUMN "metadata_json" JSONB,
  ADD COLUMN "request_json" JSONB,
  ADD COLUMN "response_json" JSONB;

CREATE UNIQUE INDEX "payment_attempts_invoice_id_provider_idempotency_key_key"
  ON "payment_attempts"("invoice_id", "provider", "idempotency_key");
