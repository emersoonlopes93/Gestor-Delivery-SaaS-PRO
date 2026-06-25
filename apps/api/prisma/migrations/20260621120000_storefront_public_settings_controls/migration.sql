ALTER TABLE "tenant_settings"
  ADD COLUMN "order_whatsapp_number" VARCHAR(20);

ALTER TABLE "tenant_settings"
  ALTER COLUMN "loyalty_enabled" SET DEFAULT false;

ALTER TABLE "tenant_settings"
  ALTER COLUMN "cashback_enabled" SET DEFAULT false;

ALTER TABLE "tenant_settings"
  ALTER COLUMN "cashback_percent" SET DEFAULT 0;
