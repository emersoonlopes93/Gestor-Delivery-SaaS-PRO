CREATE TABLE "product_option_group_authoring_requests" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "idempotency_key" VARCHAR(100) NOT NULL,
  "request_hash" VARCHAR(64) NOT NULL,
  "option_group_id" TEXT NOT NULL,
  "link_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_option_group_authoring_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "product_option_group_authoring_requests_tenant_product_key" ON "product_option_group_authoring_requests"("tenant_id", "product_id", "idempotency_key");
CREATE INDEX "product_option_group_authoring_requests_tenant_product_idx" ON "product_option_group_authoring_requests"("tenant_id", "product_id");
ALTER TABLE "product_option_group_authoring_requests" ADD CONSTRAINT "product_option_group_authoring_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_option_group_authoring_requests" ADD CONSTRAINT "product_option_group_authoring_requests_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_option_group_authoring_requests" ADD CONSTRAINT "product_option_group_authoring_requests_option_group_id_fkey" FOREIGN KEY ("option_group_id") REFERENCES "option_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_option_group_authoring_requests" ADD CONSTRAINT "product_option_group_authoring_requests_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "product_option_group_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;
