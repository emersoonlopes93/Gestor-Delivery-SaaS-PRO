-- Create scheduling settings table
CREATE TABLE "scheduling_settings" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "accept_scheduled_orders" BOOLEAN NOT NULL DEFAULT true,
  "minimum_advance_minutes" INTEGER NOT NULL DEFAULT 60,
  "maximum_advance_days" INTEGER NOT NULL DEFAULT 7,
  "slot_interval_minutes" INTEGER NOT NULL DEFAULT 30,
  "max_orders_per_slot" INTEGER NOT NULL DEFAULT 4,
  "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scheduling_settings_pkey" PRIMARY KEY ("id")
);

-- Create scheduling windows table
CREATE TABLE "scheduling_windows" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "day_of_week" INTEGER NOT NULL,
  "start_time" TEXT NOT NULL,
  "end_time" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scheduling_windows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "scheduling_settings_tenant_id_key" ON "scheduling_settings"("tenant_id");
CREATE INDEX "scheduling_windows_tenant_id_day_of_week_idx" ON "scheduling_windows"("tenant_id", "day_of_week");

ALTER TABLE "scheduling_settings"
  ADD CONSTRAINT "scheduling_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "scheduling_windows"
  ADD CONSTRAINT "scheduling_windows_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add order scheduling fields
ALTER TABLE "orders" ADD COLUMN "scheduled_for" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "is_scheduled" BOOLEAN NOT NULL DEFAULT false;
