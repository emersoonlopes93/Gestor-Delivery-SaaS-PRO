ALTER TABLE "delivery_runs"
  ADD COLUMN "route_provider" VARCHAR(40),
  ADD COLUMN "route_quality" VARCHAR(20),
  ADD COLUMN "route_geometry" JSONB,
  ADD COLUMN "route_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "route_distance_meters" INTEGER,
  ADD COLUMN "route_duration_seconds" INTEGER,
  ADD COLUMN "route_calculated_at" TIMESTAMP(3);

ALTER TABLE "delivery_stops"
  ADD COLUMN "route_distance_meters" INTEGER,
  ADD COLUMN "route_duration_seconds" INTEGER,
  ADD COLUMN "estimated_arrival_at" TIMESTAMP(3);
