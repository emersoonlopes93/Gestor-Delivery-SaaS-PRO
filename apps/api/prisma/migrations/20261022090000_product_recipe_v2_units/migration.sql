-- Product Recipe V2 keeps the tenant-authored unit alongside the canonical
-- quantity consumed by expansion. Existing demo data is deterministic: each
-- old quantity was already expressed in the target relation's base unit.

ALTER TABLE "product_recipe_ingredients"
  ALTER COLUMN "quantity" TYPE DECIMAL(14,6),
  ADD COLUMN "input_quantity" DECIMAL(14,6),
  ADD COLUMN "input_unit" "UnitType";

ALTER TABLE "recipe_base_ingredients"
  ADD COLUMN "input_quantity" DECIMAL(14,6),
  ADD COLUMN "input_unit" "UnitType";

ALTER TABLE "recipe_base_dependencies"
  ADD COLUMN "input_quantity" DECIMAL(14,6),
  ADD COLUMN "input_unit" "UnitType";

ALTER TABLE "product_recipe_bases"
  ADD COLUMN "input_quantity" DECIMAL(14,6),
  ADD COLUMN "input_unit" "UnitType";

UPDATE "product_recipe_ingredients" AS link
SET "input_quantity" = link."quantity", "input_unit" = ingredient."unit"
FROM "ingredients" AS ingredient
WHERE ingredient."id" = link."ingredient_id"
  AND ingredient."tenant_id" = link."tenant_id";

UPDATE "recipe_base_ingredients" AS component
SET "input_quantity" = component."quantity", "input_unit" = ingredient."unit"
FROM "ingredients" AS ingredient
WHERE ingredient."id" = component."ingredient_id"
  AND ingredient."tenant_id" = component."tenant_id";

UPDATE "recipe_base_dependencies" AS dependency
SET "input_quantity" = dependency."quantity", "input_unit" = child."output_unit"
FROM "recipe_bases" AS child
WHERE child."id" = dependency."component_base_id"
  AND child."tenant_id" = dependency."tenant_id";

UPDATE "product_recipe_bases" AS link
SET "input_quantity" = link."quantity", "input_unit" = base."output_unit"
FROM "recipe_bases" AS base
WHERE base."id" = link."base_id"
  AND base."tenant_id" = link."tenant_id";

ALTER TABLE "product_recipe_ingredients"
  ALTER COLUMN "input_quantity" SET NOT NULL,
  ALTER COLUMN "input_unit" SET NOT NULL;

ALTER TABLE "recipe_base_ingredients"
  ALTER COLUMN "input_quantity" SET NOT NULL,
  ALTER COLUMN "input_unit" SET NOT NULL;

ALTER TABLE "recipe_base_dependencies"
  ALTER COLUMN "input_quantity" SET NOT NULL,
  ALTER COLUMN "input_unit" SET NOT NULL;

ALTER TABLE "product_recipe_bases"
  ALTER COLUMN "input_quantity" SET NOT NULL,
  ALTER COLUMN "input_unit" SET NOT NULL;
