-- Sprint 5C: additive-only iFood polling telemetry and deterministic ordering metadata.
CREATE TYPE "MarketplaceEventChannel" AS ENUM ('WEBHOOK', 'POLLING');
CREATE TYPE "MarketplacePollingStatus" AS ENUM ('DISABLED', 'HEALTHY', 'DEGRADED', 'BLOCKED');

ALTER TABLE "marketplace_connections"
  ADD COLUMN "polling_status" "MarketplacePollingStatus" NOT NULL DEFAULT 'DISABLED',
  ADD COLUMN "polling_last_attempt_at" TIMESTAMP(3),
  ADD COLUMN "polling_last_success_at" TIMESTAMP(3),
  ADD COLUMN "polling_last_failure_at" TIMESTAMP(3),
  ADD COLUMN "polling_next_attempt_at" TIMESTAMP(3),
  ADD COLUMN "polling_last_error" VARCHAR(500),
  ADD COLUMN "polling_blocked_reason" VARCHAR(500),
  ADD COLUMN "polling_consecutive_failures" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "polling_cycles" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "polling_events_received" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "polling_events_persisted" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "polling_duplicate_events" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "polling_acknowledged_events" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "polling_acknowledgment_failures" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "marketplace_event_inbox"
  ADD COLUMN "first_delivery_channel" "MarketplaceEventChannel" NOT NULL DEFAULT 'WEBHOOK',
  ADD COLUMN "last_delivery_channel" "MarketplaceEventChannel" NOT NULL DEFAULT 'WEBHOOK',
  ADD COLUMN "delivery_count" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "last_received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "marketplace_orders"
  ADD COLUMN "last_external_event_sequence" BIGINT,
  ADD COLUMN "last_external_event_topic" VARCHAR(120);

ALTER TABLE "marketplace_connections"
  ADD CONSTRAINT "marketplace_connections_polling_counters_nonnegative" CHECK (
    "polling_consecutive_failures" >= 0 AND
    "polling_cycles" >= 0 AND
    "polling_events_received" >= 0 AND
    "polling_events_persisted" >= 0 AND
    "polling_duplicate_events" >= 0 AND
    "polling_acknowledged_events" >= 0 AND
    "polling_acknowledgment_failures" >= 0
  );

ALTER TABLE "marketplace_event_inbox"
  ADD CONSTRAINT "marketplace_event_inbox_delivery_count_positive" CHECK ("delivery_count" >= 1);

CREATE INDEX "marketplace_connections_provider_polling_status_polling_next_attempt_at_idx"
  ON "marketplace_connections"("provider", "polling_status", "polling_next_attempt_at");
CREATE INDEX "marketplace_connections_tenant_id_polling_status_idx"
  ON "marketplace_connections"("tenant_id", "polling_status");
CREATE INDEX "marketplace_event_inbox_tenant_id_last_delivery_channel_last_received_at_idx"
  ON "marketplace_event_inbox"("tenant_id", "last_delivery_channel", "last_received_at");
