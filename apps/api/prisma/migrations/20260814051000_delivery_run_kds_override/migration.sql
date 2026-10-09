ALTER TABLE "delivery_runs"
  ADD COLUMN "kds_override_at" TIMESTAMP(3),
  ADD COLUMN "kds_override_by" VARCHAR(100),
  ADD COLUMN "kds_override_reason" VARCHAR(255);
