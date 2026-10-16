-- Sprint 5B is additive. Existing marketplace audit rows are preserved.
CREATE TYPE "MarketplaceDivergenceType" AS ENUM (
  'LOCAL_AHEAD',
  'REMOTE_AHEAD',
  'OPERATION_TIMEOUT',
  'EVENT_MISSING',
  'INVALID_TRANSITION',
  'AUTHENTICATION_FAILURE',
  'MERCHANT_MAPPING_FAILURE',
  'PERMANENT_PROVIDER_REJECTION',
  'UNKNOWN_EXTERNAL_STATE'
);

CREATE TYPE "MarketplaceDivergenceStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

ALTER TABLE "marketplace_event_inbox"
  ADD COLUMN "event_created_at" TIMESTAMP(3),
  ADD COLUMN "event_sequence" BIGINT,
  ADD COLUMN "correlation_id" VARCHAR(120),
  ADD COLUMN "duplicate_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "processing_started_at" TIMESTAMP(3);

UPDATE "marketplace_event_inbox"
SET "correlation_id" = "id"
WHERE "correlation_id" IS NULL;

ALTER TABLE "marketplace_event_inbox"
  ALTER COLUMN "correlation_id" SET NOT NULL;

ALTER TABLE "marketplace_orders"
  ADD COLUMN "external_created_at" TIMESTAMP(3),
  ADD COLUMN "preparation_start_at" TIMESTAMP(3),
  ADD COLUMN "confirmation_deadline_at" TIMESTAMP(3),
  ADD COLUMN "last_external_event_at" TIMESTAMP(3),
  ADD COLUMN "last_external_event_id" VARCHAR(180);

ALTER TABLE "marketplace_operations"
  ADD COLUMN "enqueued_at" TIMESTAMP(3),
  ADD COLUMN "first_attempt_at" TIMESTAMP(3),
  ADD COLUMN "deadline_at" TIMESTAMP(3),
  ADD COLUMN "queue_delay_ms" INTEGER,
  ADD COLUMN "parent_operation_id" TEXT,
  ADD COLUMN "requested_by_admin_id" TEXT,
  ADD COLUMN "admin_retry_number" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "marketplace_divergences" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "marketplace_order_id" TEXT NOT NULL,
  "internal_order_id" TEXT,
  "operation_id" TEXT,
  "provider" "MarketplaceProvider" NOT NULL,
  "external_order_id" VARCHAR(120) NOT NULL,
  "type" "MarketplaceDivergenceType" NOT NULL,
  "status" "MarketplaceDivergenceStatus" NOT NULL DEFAULT 'OPEN',
  "local_state" VARCHAR(60),
  "remote_state" VARCHAR(120),
  "reason" VARCHAR(500) NOT NULL,
  "recommended_action" VARCHAR(500) NOT NULL,
  "correlation_id" VARCHAR(120) NOT NULL,
  "last_attempt_at" TIMESTAMP(3),
  "acknowledged_at" TIMESTAMP(3),
  "acknowledged_by" TEXT,
  "resolved_at" TIMESTAMP(3),
  "resolution_note" VARCHAR(500),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "marketplace_divergences_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "marketplace_event_inbox_tenant_id_external_order_id_event_created_at_idx"
  ON "marketplace_event_inbox"("tenant_id", "external_order_id", "event_created_at");
CREATE INDEX "marketplace_operations_tenant_id_deadline_at_status_idx"
  ON "marketplace_operations"("tenant_id", "deadline_at", "status");
CREATE INDEX "marketplace_operations_parent_operation_id_idx"
  ON "marketplace_operations"("parent_operation_id");
CREATE INDEX "marketplace_divergences_tenant_id_status_created_at_idx"
  ON "marketplace_divergences"("tenant_id", "status", "created_at");
CREATE INDEX "marketplace_divergences_tenant_id_type_status_idx"
  ON "marketplace_divergences"("tenant_id", "type", "status");
CREATE INDEX "marketplace_divergences_marketplace_order_id_status_idx"
  ON "marketplace_divergences"("marketplace_order_id", "status");
CREATE INDEX "marketplace_divergences_operation_id_idx"
  ON "marketplace_divergences"("operation_id");

ALTER TABLE "marketplace_operations"
  ADD CONSTRAINT "marketplace_operations_parent_operation_id_fkey"
  FOREIGN KEY ("parent_operation_id") REFERENCES "marketplace_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "marketplace_divergences"
  ADD CONSTRAINT "marketplace_divergences_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_divergences"
  ADD CONSTRAINT "marketplace_divergences_marketplace_order_id_fkey"
  FOREIGN KEY ("marketplace_order_id") REFERENCES "marketplace_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_divergences"
  ADD CONSTRAINT "marketplace_divergences_internal_order_id_fkey"
  FOREIGN KEY ("internal_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "marketplace_divergences"
  ADD CONSTRAINT "marketplace_divergences_operation_id_fkey"
  FOREIGN KEY ("operation_id") REFERENCES "marketplace_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
