ALTER TABLE "tenant_settings"
ADD COLUMN "pickup_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "pickup_min_minutes" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN "pickup_max_minutes" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "scheduling_settings"
ADD COLUMN "allow_schedule_when_closed" BOOLEAN NOT NULL DEFAULT false;
