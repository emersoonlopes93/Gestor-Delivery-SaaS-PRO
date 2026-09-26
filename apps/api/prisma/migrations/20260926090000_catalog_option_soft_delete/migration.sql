ALTER TABLE "option_groups" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "option_items" ADD COLUMN "deleted_at" TIMESTAMP(3);

CREATE INDEX "option_groups_tenant_id_deleted_at_idx" ON "option_groups"("tenant_id", "deleted_at");
CREATE INDEX "option_items_tenant_id_deleted_at_idx" ON "option_items"("tenant_id", "deleted_at");
