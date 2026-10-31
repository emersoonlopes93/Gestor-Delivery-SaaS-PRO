-- CreateEnum
CREATE TYPE "MarketplaceOperationType" AS ENUM ('CONFIRM', 'CANCEL');

-- CreateEnum
CREATE TYPE "MarketplaceOperationStatus" AS ENUM (
  'PENDING',
  'QUEUED',
  'PROCESSING',
  'ACCEPTED',
  'SUCCEEDED',
  'FAILED',
  'INTERVENTION_REQUIRED'
);

-- CreateTable
CREATE TABLE "marketplace_operations" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "connection_id" TEXT NOT NULL,
  "marketplace_order_id" TEXT NOT NULL,
  "provider" "MarketplaceProvider" NOT NULL,
  "external_order_id" VARCHAR(120) NOT NULL,
  "operation" "MarketplaceOperationType" NOT NULL,
  "status" "MarketplaceOperationStatus" NOT NULL DEFAULT 'PENDING',
  "idempotency_key" VARCHAR(300) NOT NULL,
  "payload_version" INTEGER NOT NULL DEFAULT 1,
  "cancellation_reason" VARCHAR(40),
  "correlation_id" VARCHAR(120) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_attempt_at" TIMESTAMP(3),
  "accepted_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "http_status" INTEGER,
  "provider_code" VARCHAR(120),
  "last_error" VARCHAR(500),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "marketplace_operations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketplace_operations_tenant_id_idempotency_key_key"
  ON "marketplace_operations"("tenant_id", "idempotency_key");
CREATE INDEX "marketplace_operations_tenant_id_status_created_at_idx"
  ON "marketplace_operations"("tenant_id", "status", "created_at");
CREATE INDEX "marketplace_ops_order_operation_status_idx"
  ON "marketplace_operations"("marketplace_order_id", "operation", "status");

ALTER TABLE "marketplace_operations"
  ADD CONSTRAINT "marketplace_operations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_operations"
  ADD CONSTRAINT "marketplace_operations_connection_id_fkey"
  FOREIGN KEY ("connection_id") REFERENCES "marketplace_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_operations"
  ADD CONSTRAINT "marketplace_operations_marketplace_order_id_fkey"
  FOREIGN KEY ("marketplace_order_id") REFERENCES "marketplace_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
