CREATE TABLE "feature_tenant_overrides" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "feature_key" VARCHAR(80) NOT NULL,
  "mode" VARCHAR(20) NOT NULL,
  "reason" VARCHAR(255),
  "expires_at" TIMESTAMP(3),
  "updated_by" VARCHAR(120),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "feature_tenant_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "feature_tenant_overrides_tenant_id_feature_key_key" ON "feature_tenant_overrides"("tenant_id", "feature_key");
CREATE INDEX "feature_tenant_overrides_tenant_id_idx" ON "feature_tenant_overrides"("tenant_id");
CREATE INDEX "feature_tenant_overrides_feature_key_idx" ON "feature_tenant_overrides"("feature_key");

ALTER TABLE "feature_tenant_overrides"
ADD CONSTRAINT "feature_tenant_overrides_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
