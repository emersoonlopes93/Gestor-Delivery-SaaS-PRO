-- Additive schema for reusable virtual recipe bases. Existing recipes remain unchanged.
CREATE TABLE "recipe_bases" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "output_unit" "UnitType" NOT NULL,
    "yield_quantity" DECIMAL(14,6) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "recipe_bases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recipe_base_ingredients" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "base_id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "quantity" DECIMAL(14,6) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recipe_base_ingredients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recipe_base_dependencies" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "base_id" TEXT NOT NULL,
    "component_base_id" TEXT NOT NULL,
    "quantity" DECIMAL(14,6) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recipe_base_dependencies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_recipe_bases" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "base_id" TEXT NOT NULL,
    "quantity" DECIMAL(14,6) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_recipe_bases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ingredients_id_tenant_id_key" ON "ingredients"("id", "tenant_id");
CREATE UNIQUE INDEX "products_id_tenant_id_key" ON "products"("id", "tenant_id");
CREATE INDEX "recipe_bases_tenant_id_is_active_idx" ON "recipe_bases"("tenant_id", "is_active");
CREATE UNIQUE INDEX "recipe_bases_tenant_id_name_key" ON "recipe_bases"("tenant_id", "name");
CREATE UNIQUE INDEX "recipe_bases_id_tenant_id_key" ON "recipe_bases"("id", "tenant_id");
CREATE INDEX "recipe_base_ingredients_tenant_id_ingredient_id_idx" ON "recipe_base_ingredients"("tenant_id", "ingredient_id");
CREATE UNIQUE INDEX "recipe_base_ingredients_base_id_ingredient_id_key" ON "recipe_base_ingredients"("base_id", "ingredient_id");
CREATE INDEX "recipe_base_dependencies_tenant_id_component_base_id_idx" ON "recipe_base_dependencies"("tenant_id", "component_base_id");
CREATE UNIQUE INDEX "recipe_base_dependencies_base_id_component_base_id_key" ON "recipe_base_dependencies"("base_id", "component_base_id");
CREATE INDEX "product_recipe_bases_tenant_id_product_id_idx" ON "product_recipe_bases"("tenant_id", "product_id");
CREATE INDEX "product_recipe_bases_tenant_id_base_id_idx" ON "product_recipe_bases"("tenant_id", "base_id");
CREATE UNIQUE INDEX "product_recipe_bases_product_id_base_id_key" ON "product_recipe_bases"("product_id", "base_id");

ALTER TABLE "recipe_bases" ADD CONSTRAINT "recipe_bases_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recipe_base_ingredients" ADD CONSTRAINT "recipe_base_ingredients_base_id_tenant_id_fkey"
  FOREIGN KEY ("base_id", "tenant_id") REFERENCES "recipe_bases"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recipe_base_ingredients" ADD CONSTRAINT "recipe_base_ingredients_ingredient_id_tenant_id_fkey"
  FOREIGN KEY ("ingredient_id", "tenant_id") REFERENCES "ingredients"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recipe_base_ingredients" ADD CONSTRAINT "recipe_base_ingredients_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recipe_base_dependencies" ADD CONSTRAINT "recipe_base_dependencies_base_id_tenant_id_fkey"
  FOREIGN KEY ("base_id", "tenant_id") REFERENCES "recipe_bases"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recipe_base_dependencies" ADD CONSTRAINT "recipe_base_dependencies_component_base_id_tenant_id_fkey"
  FOREIGN KEY ("component_base_id", "tenant_id") REFERENCES "recipe_bases"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recipe_base_dependencies" ADD CONSTRAINT "recipe_base_dependencies_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_recipe_bases" ADD CONSTRAINT "product_recipe_bases_product_id_tenant_id_fkey"
  FOREIGN KEY ("product_id", "tenant_id") REFERENCES "products"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_recipe_bases" ADD CONSTRAINT "product_recipe_bases_base_id_tenant_id_fkey"
  FOREIGN KEY ("base_id", "tenant_id") REFERENCES "recipe_bases"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_recipe_bases" ADD CONSTRAINT "product_recipe_bases_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
