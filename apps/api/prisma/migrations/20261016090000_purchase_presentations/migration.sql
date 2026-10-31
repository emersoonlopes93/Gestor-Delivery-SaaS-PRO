-- Purchase presentations are tenant-owned commercial packaging definitions.
CREATE TABLE "purchase_presentations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "conversion_factor" DECIMAL(14,6) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "purchase_presentations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "purchase_items"
  ADD COLUMN "purchase_presentation_id" TEXT,
  ADD COLUMN "purchase_quantity" DECIMAL(14,6),
  ADD COLUMN "purchase_presentation_label" VARCHAR(120),
  ADD COLUMN "conversion_factor_snapshot" DECIMAL(14,6);

CREATE INDEX "purchase_presentations_tenant_id_ingredient_id_idx" ON "purchase_presentations"("tenant_id", "ingredient_id");
CREATE INDEX "purchase_presentations_tenant_id_ingredient_id_is_active_idx" ON "purchase_presentations"("tenant_id", "ingredient_id", "is_active");
CREATE INDEX "purchase_items_purchase_presentation_id_idx" ON "purchase_items"("purchase_presentation_id");

ALTER TABLE "purchase_presentations" ADD CONSTRAINT "purchase_presentations_ingredient_id_fkey"
  FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_presentations" ADD CONSTRAINT "purchase_presentations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_presentation_id_fkey"
  FOREIGN KEY ("purchase_presentation_id") REFERENCES "purchase_presentations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
