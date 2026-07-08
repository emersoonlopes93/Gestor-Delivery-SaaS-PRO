CREATE TABLE "feature_global_settings" (
  "id" TEXT NOT NULL,
  "feature_key" VARCHAR(80) NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "reason" VARCHAR(255),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "updated_by" VARCHAR(120),

  CONSTRAINT "feature_global_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "feature_global_settings_feature_key_key" ON "feature_global_settings"("feature_key");
CREATE INDEX "feature_global_settings_status_idx" ON "feature_global_settings"("status");
