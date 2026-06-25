ALTER TABLE "printer_devices"
  ALTER COLUMN "station_id" DROP NOT NULL,
  ADD COLUMN "is_primary" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "role" VARCHAR(40) NOT NULL DEFAULT 'station',
  ADD COLUMN "purpose" VARCHAR(40) NOT NULL DEFAULT 'production_ticket',
  ADD COLUMN "auto_print_enabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "printer_devices" DROP CONSTRAINT IF EXISTS "printer_devices_station_id_fkey";

ALTER TABLE "printer_devices"
  ADD CONSTRAINT "printer_devices_station_id_fkey"
  FOREIGN KEY ("station_id") REFERENCES "print_stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "printer_devices_tenant_id_is_primary_idx" ON "printer_devices"("tenant_id", "is_primary");
CREATE INDEX "printer_devices_tenant_id_role_idx" ON "printer_devices"("tenant_id", "role");
