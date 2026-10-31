ALTER TABLE "delivery_driver_locations"
  ADD COLUMN "shift_id" TEXT,
  ADD COLUMN "run_id" TEXT,
  ADD COLUMN "event_key" VARCHAR(128),
  ADD COLUMN "recorded_at" TIMESTAMP(3),
  ADD COLUMN "accuracy" DOUBLE PRECISION,
  ADD COLUMN "heading" DOUBLE PRECISION,
  ADD COLUMN "speed" DOUBLE PRECISION,
  ADD COLUMN "source" VARCHAR(20) NOT NULL DEFAULT 'foreground';

UPDATE "delivery_driver_locations"
SET "recorded_at" = "created_at"
WHERE "recorded_at" IS NULL;

ALTER TABLE "delivery_driver_locations"
  ALTER COLUMN "recorded_at" SET NOT NULL,
  ALTER COLUMN "recorded_at" SET DEFAULT CURRENT_TIMESTAMP;

DROP INDEX IF EXISTS "delivery_driver_locations_tenant_id_driver_id_created_at_idx";

CREATE INDEX "delivery_driver_locations_tenant_id_driver_id_recorded_at_idx"
  ON "delivery_driver_locations"("tenant_id", "driver_id", "recorded_at");
CREATE INDEX "delivery_driver_locations_tenant_id_run_id_recorded_at_idx"
  ON "delivery_driver_locations"("tenant_id", "run_id", "recorded_at");
CREATE INDEX "delivery_driver_locations_tenant_id_shift_id_recorded_at_idx"
  ON "delivery_driver_locations"("tenant_id", "shift_id", "recorded_at");
CREATE UNIQUE INDEX "delivery_driver_locations_tenant_id_driver_id_event_key_key"
  ON "delivery_driver_locations"("tenant_id", "driver_id", "event_key");

ALTER TABLE "delivery_driver_locations"
  ADD CONSTRAINT "delivery_driver_locations_shift_id_fkey"
  FOREIGN KEY ("shift_id") REFERENCES "driver_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "delivery_driver_locations"
  ADD CONSTRAINT "delivery_driver_locations_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "delivery_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
