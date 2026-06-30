ALTER TABLE "delivery_coverage_configs"
  ADD COLUMN IF NOT EXISTS "default_estimated_delivery_minutes" INTEGER;

ALTER TABLE "delivery_rate_rules"
  ADD COLUMN IF NOT EXISTS "estimated_delivery_minutes" INTEGER;

ALTER TABLE "delivery_rate_distance_tiers"
  ADD COLUMN IF NOT EXISTS "estimated_delivery_minutes" INTEGER;
