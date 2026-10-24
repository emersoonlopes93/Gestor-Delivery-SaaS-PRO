CREATE TYPE "MarketplaceCatalogMappingStatus" AS ENUM ('ACTIVE', 'DISABLED');

CREATE TABLE "marketplace_catalog_mappings" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "provider" "MarketplaceProvider" NOT NULL,
    "external_item_id" VARCHAR(180) NOT NULL,
    "external_item_name" VARCHAR(255),
    "external_reference_id" VARCHAR(500),
    "product_id" TEXT NOT NULL,
    "status" "MarketplaceCatalogMappingStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "marketplace_catalog_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "marketplace_catalog_mappings_connection_id_provider_external_item_id_key"
  ON "marketplace_catalog_mappings"("connection_id", "provider", "external_item_id");
CREATE INDEX "marketplace_catalog_mappings_tenant_id_provider_status_idx"
  ON "marketplace_catalog_mappings"("tenant_id", "provider", "status");
CREATE INDEX "marketplace_catalog_mappings_tenant_id_product_id_idx"
  ON "marketplace_catalog_mappings"("tenant_id", "product_id");

ALTER TABLE "marketplace_catalog_mappings"
  ADD CONSTRAINT "marketplace_catalog_mappings_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_catalog_mappings"
  ADD CONSTRAINT "marketplace_catalog_mappings_connection_id_fkey"
  FOREIGN KEY ("connection_id") REFERENCES "marketplace_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "marketplace_catalog_mappings"
  ADD CONSTRAINT "marketplace_catalog_mappings_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
