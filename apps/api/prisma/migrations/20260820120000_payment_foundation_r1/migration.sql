CREATE TYPE "PaymentProviderConnectionStatus" AS ENUM ('PENDING', 'CONNECTED', 'ERROR', 'DISABLED');
CREATE TYPE "OrderPaymentAttemptStatus" AS ENUM ('CREATED', 'PENDING', 'PAID', 'FAILED', 'EXPIRED', 'CANCELED', 'REFUNDED', 'PARTIALLY_REFUNDED');

CREATE TABLE "payment_provider_connections" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "status" "PaymentProviderConnectionStatus" NOT NULL DEFAULT 'PENDING',
  "external_account_id" VARCHAR(160),
  "credentials_encrypted" TEXT,
  "credentials_version" VARCHAR(80),
  "last_verified_at" TIMESTAMP(3),
  "disabled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_provider_connections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "order_payment_attempts" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "provider_connection_id" TEXT,
  "status" "OrderPaymentAttemptStatus" NOT NULL DEFAULT 'CREATED',
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(10) NOT NULL DEFAULT 'BRL',
  "external_payment_id" VARCHAR(255),
  "idempotency_key" VARCHAR(160) NOT NULL,
  "expires_at" TIMESTAMP(3),
  "paid_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "failure_code" VARCHAR(120),
  "failure_reason" VARCHAR(500),
  "metadata_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "order_payment_attempts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PaymentTransaction"
  ADD COLUMN "order_payment_attempt_id" TEXT;

ALTER TABLE "external_webhook_events"
  ADD COLUMN "provider_connection_id" TEXT,
  ADD COLUMN "order_payment_attempt_id" TEXT,
  ADD COLUMN "external_payment_id" VARCHAR(255),
  ADD COLUMN "event_type" VARCHAR(120);

CREATE UNIQUE INDEX "payment_provider_connections_tenant_id_provider_key"
  ON "payment_provider_connections"("tenant_id", "provider");
CREATE INDEX "payment_provider_connections_tenant_id_status_idx"
  ON "payment_provider_connections"("tenant_id", "status");
CREATE INDEX "payment_provider_connections_provider_external_account_id_idx"
  ON "payment_provider_connections"("provider", "external_account_id");

CREATE UNIQUE INDEX "order_payment_attempts_tenant_id_order_id_idempotency_key_key"
  ON "order_payment_attempts"("tenant_id", "order_id", "idempotency_key");
CREATE UNIQUE INDEX "order_payment_attempts_provider_connection_id_external_payment_id_key"
  ON "order_payment_attempts"("provider_connection_id", "external_payment_id");
CREATE INDEX "order_payment_attempts_tenant_id_order_id_created_at_idx"
  ON "order_payment_attempts"("tenant_id", "order_id", "created_at");
CREATE INDEX "order_payment_attempts_tenant_id_status_idx"
  ON "order_payment_attempts"("tenant_id", "status");

CREATE UNIQUE INDEX "PaymentTransaction_order_payment_attempt_id_key"
  ON "PaymentTransaction"("order_payment_attempt_id");
CREATE INDEX "external_webhook_events_provider_connection_id_status_idx"
  ON "external_webhook_events"("provider_connection_id", "status");
CREATE INDEX "external_webhook_events_order_payment_attempt_id_idx"
  ON "external_webhook_events"("order_payment_attempt_id");
CREATE INDEX "external_webhook_events_provider_external_payment_id_idx"
  ON "external_webhook_events"("provider", "external_payment_id");

ALTER TABLE "payment_provider_connections"
  ADD CONSTRAINT "payment_provider_connections_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_payment_attempts"
  ADD CONSTRAINT "order_payment_attempts_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_payment_attempts"
  ADD CONSTRAINT "order_payment_attempts_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_payment_attempts"
  ADD CONSTRAINT "order_payment_attempts_provider_connection_id_fkey"
  FOREIGN KEY ("provider_connection_id") REFERENCES "payment_provider_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PaymentTransaction"
  ADD CONSTRAINT "PaymentTransaction_order_payment_attempt_id_fkey"
  FOREIGN KEY ("order_payment_attempt_id") REFERENCES "order_payment_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "external_webhook_events"
  ADD CONSTRAINT "external_webhook_events_provider_connection_id_fkey"
  FOREIGN KEY ("provider_connection_id") REFERENCES "payment_provider_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "external_webhook_events"
  ADD CONSTRAINT "external_webhook_events_order_payment_attempt_id_fkey"
  FOREIGN KEY ("order_payment_attempt_id") REFERENCES "order_payment_attempts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE FUNCTION prevent_order_payment_attempt_identity_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."tenant_id" IS DISTINCT FROM OLD."tenant_id"
     OR NEW."order_id" IS DISTINCT FROM OLD."order_id"
     OR NEW."provider" IS DISTINCT FROM OLD."provider"
     OR NEW."provider_connection_id" IS DISTINCT FROM OLD."provider_connection_id"
     OR NEW."amount" IS DISTINCT FROM OLD."amount"
     OR NEW."currency" IS DISTINCT FROM OLD."currency"
     OR NEW."idempotency_key" IS DISTINCT FROM OLD."idempotency_key" THEN
    RAISE EXCEPTION 'order payment attempt identity is immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "order_payment_attempt_identity_immutable"
BEFORE UPDATE ON "order_payment_attempts"
FOR EACH ROW EXECUTE FUNCTION prevent_order_payment_attempt_identity_update();
