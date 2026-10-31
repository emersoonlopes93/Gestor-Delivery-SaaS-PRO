CREATE TABLE "analytics_events" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "event_id" VARCHAR(128) NOT NULL,
  "schema_version" INTEGER NOT NULL,
  "event_name" VARCHAR(64) NOT NULL,
  "source" VARCHAR(16) NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "received_at" TIMESTAMP(3) NOT NULL,
  "session_id" VARCHAR(128) NOT NULL,
  "visitor_id" VARCHAR(128),
  "category_id" VARCHAR(128),
  "product_id" VARCHAR(128),
  "order_id" VARCHAR(128),
  "page_path" VARCHAR(512),
  "landing_path" VARCHAR(512),
  "referrer_host" VARCHAR(253),
  "utm_source" VARCHAR(100),
  "utm_medium" VARCHAR(100),
  "utm_campaign" VARCHAR(100),
  "utm_content" VARCHAR(100),
  "utm_term" VARCHAR(100),
  "quantity" INTEGER,
  "item_count" INTEGER,
  "unit_price" DECIMAL(14,2),
  "value" DECIMAL(16,2),
  "currency" VARCHAR(3),
  "consent_analytics" BOOLEAN NOT NULL,
  "consent_marketing" BOOLEAN NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "analytics_events_tenant_id_event_id_key" ON "analytics_events"("tenant_id", "event_id");
CREATE INDEX "analytics_events_tenant_id_event_name_occurred_at_idx" ON "analytics_events"("tenant_id", "event_name", "occurred_at");
CREATE INDEX "analytics_events_tenant_id_session_id_occurred_at_idx" ON "analytics_events"("tenant_id", "session_id", "occurred_at");
CREATE INDEX "analytics_events_tenant_id_product_id_event_name_occurred_at_idx" ON "analytics_events"("tenant_id", "product_id", "event_name", "occurred_at");
CREATE INDEX "analytics_events_tenant_id_order_id_event_name_occurred_at_idx" ON "analytics_events"("tenant_id", "order_id", "event_name", "occurred_at");

ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
