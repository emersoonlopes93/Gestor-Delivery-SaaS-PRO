ALTER TABLE "system_configs"
  ADD COLUMN "platform_logo_media_id" TEXT;

CREATE INDEX "system_configs_platform_logo_media_id_idx"
  ON "system_configs"("platform_logo_media_id");

ALTER TABLE "system_configs"
  ADD CONSTRAINT "system_configs_platform_logo_media_id_fkey"
  FOREIGN KEY ("platform_logo_media_id")
  REFERENCES "media_assets"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
