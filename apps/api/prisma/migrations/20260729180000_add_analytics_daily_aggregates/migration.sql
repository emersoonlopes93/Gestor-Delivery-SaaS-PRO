CREATE TABLE "analytics_daily_aggregates" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "bucket_date" DATE NOT NULL,
  "timezone" VARCHAR(64) NOT NULL,
  "event_name" VARCHAR(64) NOT NULL,
  "dimension_type" VARCHAR(32) NOT NULL,
  "dimension_key" VARCHAR(128) NOT NULL,
  "event_count" INTEGER NOT NULL,
  "unique_sessions" INTEGER NOT NULL,
  "value_sum" DECIMAL(20,2) NOT NULL DEFAULT 0,
  "quantity_sum" INTEGER NOT NULL DEFAULT 0,
  "item_count_sum" INTEGER NOT NULL DEFAULT 0,
  "first_occurred_at" TIMESTAMP(3) NOT NULL,
  "last_occurred_at" TIMESTAMP(3) NOT NULL,
  "computed_at" TIMESTAMP(3) NOT NULL,
  "source_max_received_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "analytics_daily_aggregates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "analytics_daily_aggregates_event_name_check" CHECK (
    "event_name" IN (
      'menu_viewed', 'category_viewed', 'product_viewed', 'product_selected',
      'add_to_cart', 'remove_from_cart', 'cart_viewed', 'checkout_started',
      'checkout_step_completed', 'order_submitted', 'search_performed',
      'coupon_applied', 'social_link_clicked', 'whatsapp_clicked',
      'order_confirmed', 'order_completed', 'order_cancelled'
    )
  ),
  CONSTRAINT "analytics_daily_aggregates_dimension_check" CHECK (
    "dimension_type" IN (
      'overall', 'product', 'category', 'utm_source', 'utm_medium', 'utm_campaign'
    )
  ),
  CONSTRAINT "analytics_daily_aggregates_overall_key_check" CHECK (
    ("dimension_type" = 'overall' AND "dimension_key" = '__all__')
    OR ("dimension_type" <> 'overall' AND "dimension_key" <> '__all__')
  ),
  CONSTRAINT "analytics_daily_aggregates_metrics_check" CHECK (
    "event_count" >= 0 AND "unique_sessions" >= 0
    AND "value_sum" >= 0 AND "quantity_sum" >= 0 AND "item_count_sum" >= 0
  )
);

CREATE UNIQUE INDEX "analytics_daily_aggregates_scope_key"
  ON "analytics_daily_aggregates"(
    "tenant_id",
    "bucket_date",
    "event_name",
    "dimension_type",
    "dimension_key"
  );

CREATE INDEX "analytics_daily_aggregates_tenant_date_event_idx"
  ON "analytics_daily_aggregates"("tenant_id", "bucket_date", "event_name");

CREATE INDEX "analytics_daily_aggregates_tenant_date_dimension_idx"
  ON "analytics_daily_aggregates"("tenant_id", "bucket_date", "dimension_type", "dimension_key");

ALTER TABLE "analytics_daily_aggregates"
  ADD CONSTRAINT "analytics_daily_aggregates_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
