CREATE TABLE "tenant_feature_entitlement_overrides" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "feature_key" VARCHAR(80) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "source" VARCHAR(40) NOT NULL DEFAULT 'manual_override',
    "reason" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "created_by_admin_id" TEXT,
    "updated_by_admin_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_feature_entitlement_overrides_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tenant_feature_entitlement_overrides_tenant_id_idx" ON "tenant_feature_entitlement_overrides"("tenant_id");
CREATE INDEX "tenant_feature_entitlement_overrides_tenant_id_feature_key_enabled_idx" ON "tenant_feature_entitlement_overrides"("tenant_id", "feature_key", "enabled");
CREATE UNIQUE INDEX "tenant_feature_entitlement_overrides_tenant_id_feature_key_key" ON "tenant_feature_entitlement_overrides"("tenant_id", "feature_key");

ALTER TABLE "tenant_feature_entitlement_overrides"
ADD CONSTRAINT "tenant_feature_entitlement_overrides_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
