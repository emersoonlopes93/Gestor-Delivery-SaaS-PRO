-- Contextual physical recipes are scoped by product, option item and tenant.
-- No existing option or pricing data is inferred or backfilled.
ALTER TABLE "option_items"
  ADD CONSTRAINT "option_items_id_tenant_id_key" UNIQUE ("id", "tenant_id");

CREATE TABLE "product_option_item_recipe_ingredients" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "option_item_id" TEXT NOT NULL,
  "ingredient_id" TEXT NOT NULL,
  "quantity" DECIMAL(14,6) NOT NULL,
  "input_quantity" DECIMAL(14,6) NOT NULL,
  "input_unit" "UnitType" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_option_item_recipe_ingredients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_option_item_recipe_bases" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "product_id" TEXT NOT NULL,
  "option_item_id" TEXT NOT NULL,
  "base_id" TEXT NOT NULL,
  "quantity" DECIMAL(14,6) NOT NULL,
  "input_quantity" DECIMAL(14,6) NOT NULL,
  "input_unit" "UnitType" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "product_option_item_recipe_bases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_option_item_recipe_ingredients_product_id_option_item_id_ingredient_id_key"
  ON "product_option_item_recipe_ingredients"("product_id", "option_item_id", "ingredient_id");
CREATE INDEX "product_option_item_recipe_ingredients_tenant_id_product_id_option_item_id_idx"
  ON "product_option_item_recipe_ingredients"("tenant_id", "product_id", "option_item_id");
CREATE INDEX "product_option_item_recipe_ingredients_tenant_id_ingredient_id_idx"
  ON "product_option_item_recipe_ingredients"("tenant_id", "ingredient_id");
CREATE UNIQUE INDEX "product_option_item_recipe_bases_product_id_option_item_id_base_id_key"
  ON "product_option_item_recipe_bases"("product_id", "option_item_id", "base_id");
CREATE INDEX "product_option_item_recipe_bases_tenant_id_product_id_option_item_id_idx"
  ON "product_option_item_recipe_bases"("tenant_id", "product_id", "option_item_id");
CREATE INDEX "product_option_item_recipe_bases_tenant_id_base_id_idx"
  ON "product_option_item_recipe_bases"("tenant_id", "base_id");

ALTER TABLE "product_option_item_recipe_ingredients"
  ADD CONSTRAINT "product_option_item_recipe_ingredients_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "product_option_item_recipe_ingredients_product_id_tenant_id_fkey"
    FOREIGN KEY ("product_id", "tenant_id") REFERENCES "products"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "product_option_item_recipe_ingredients_option_item_id_tenant_id_fkey"
    FOREIGN KEY ("option_item_id", "tenant_id") REFERENCES "option_items"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "product_option_item_recipe_ingredients_ingredient_id_tenant_id_fkey"
    FOREIGN KEY ("ingredient_id", "tenant_id") REFERENCES "ingredients"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_option_item_recipe_bases"
  ADD CONSTRAINT "product_option_item_recipe_bases_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "product_option_item_recipe_bases_product_id_tenant_id_fkey"
    FOREIGN KEY ("product_id", "tenant_id") REFERENCES "products"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "product_option_item_recipe_bases_option_item_id_tenant_id_fkey"
    FOREIGN KEY ("option_item_id", "tenant_id") REFERENCES "option_items"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "product_option_item_recipe_bases_base_id_tenant_id_fkey"
    FOREIGN KEY ("base_id", "tenant_id") REFERENCES "recipe_bases"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
