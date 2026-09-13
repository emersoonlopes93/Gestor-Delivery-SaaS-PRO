-- Alert Engine 2.0: append-only occurrences, with mutable active/recovered lifecycle.
CREATE TYPE "OrderAlertSeverity" AS ENUM ('INFO', 'ATTENTION', 'CRITICAL');
CREATE TYPE "OrderAlertState" AS ENUM ('ACTIVE', 'RECOVERED');

CREATE TABLE "order_alerts" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "order_id" TEXT,
  "rule_key" VARCHAR(80) NOT NULL,
  "severity" "OrderAlertSeverity" NOT NULL,
  "state" "OrderAlertState" NOT NULL DEFAULT 'ACTIVE',
  "fingerprint" VARCHAR(300) NOT NULL,
  "occurrence" INTEGER NOT NULL DEFAULT 1,
  "title" VARCHAR(180) NOT NULL,
  "message" VARCHAR(500) NOT NULL,
  "metadata" JSONB,
  "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledged_at" TIMESTAMP(3),
  "acknowledged_by_id" TEXT,
  "recovered_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "order_alerts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_alerts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "order_alerts_tenant_id_fingerprint_occurrence_key" ON "order_alerts"("tenant_id", "fingerprint", "occurrence");
CREATE INDEX "order_alerts_tenant_id_state_severity_last_seen_at_idx" ON "order_alerts"("tenant_id", "state", "severity", "last_seen_at");
CREATE INDEX "order_alerts_tenant_id_order_id_rule_key_state_idx" ON "order_alerts"("tenant_id", "order_id", "rule_key", "state");
