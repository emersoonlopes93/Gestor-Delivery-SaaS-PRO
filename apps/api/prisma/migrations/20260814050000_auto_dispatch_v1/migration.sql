ALTER TABLE "tenant_settings"
  ADD COLUMN "smart_dispatch_mode" VARCHAR(20) NOT NULL DEFAULT 'OFF',
  ADD COLUMN "smart_dispatch_use_queue" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "smart_dispatch_bypass_distance" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "smart_dispatch_distance_km" DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN "smart_dispatch_auto_carona" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "smart_dispatch_max_stops" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "smart_dispatch_grouping_km" DOUBLE PRECISION NOT NULL DEFAULT 1;

ALTER TABLE "delivery_drivers"
  ADD COLUMN "dispatch_queue_joined_at" TIMESTAMP(3);

CREATE INDEX "delivery_drivers_tenant_id_dispatch_queue_joined_at_idx"
  ON "delivery_drivers"("tenant_id", "dispatch_queue_joined_at");
