ALTER TABLE "driver_shifts" ADD COLUMN "business_date" DATE;

-- Existing historical shifts remain nullable. Every new remunerated shift receives
-- a canonical tenant-local date through DeliveryRunsService before insertion.
CREATE UNIQUE INDEX "driver_shifts_tenant_id_driver_id_business_date_key"
  ON "driver_shifts"("tenant_id", "driver_id", "business_date")
  WHERE "business_date" IS NOT NULL;

CREATE INDEX "driver_shifts_tenant_id_driver_id_business_date_idx"
  ON "driver_shifts"("tenant_id", "driver_id", "business_date");
