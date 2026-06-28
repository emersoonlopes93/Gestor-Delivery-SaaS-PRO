CREATE TABLE IF NOT EXISTS "print_stations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "auto_print_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "print_stations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "print_stations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "print_stations_tenant_id_slug_key" ON "print_stations"("tenant_id", "slug");

CREATE TABLE IF NOT EXISTS "printer_devices" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "station_id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "connectionType" VARCHAR(50) NOT NULL,
    "address" VARCHAR(255),
    "vendor" VARCHAR(100),
    "model" VARCHAR(100),
    "paper_width" INTEGER NOT NULL DEFAULT 58,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMP(3),
    "last_error" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "printer_devices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "printer_devices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "printer_devices_station_id_fkey" FOREIGN KEY ("station_id") REFERENCES "print_stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

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
