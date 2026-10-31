-- Physical quantities are expanded by the canonical recipe engine at six
-- decimal places. Widening is additive/safe and does not rewrite values.
ALTER TABLE "ingredients"
  ALTER COLUMN "current_stock" TYPE DECIMAL(14,6),
  ALTER COLUMN "min_stock" TYPE DECIMAL(14,6);

ALTER TABLE "stock_movements"
  ALTER COLUMN "quantity" TYPE DECIMAL(14,6);

ALTER TABLE "purchase_items"
  ALTER COLUMN "quantity" TYPE DECIMAL(14,6);

ALTER TABLE "inventory_count_items"
  ALTER COLUMN "theoretical_stock" TYPE DECIMAL(14,6),
  ALTER COLUMN "physical_stock" TYPE DECIMAL(14,6),
  ALTER COLUMN "adjusted_quantity" TYPE DECIMAL(14,6);

-- Legacy recipe tables remain physical quantity stores while their readers are
-- migrated. Preserve their existing values without rounding.
ALTER TABLE "complement_recipe_ingredients"
  ALTER COLUMN "quantity" TYPE DECIMAL(14,6);

ALTER TABLE "combo_recipe_ingredients"
  ALTER COLUMN "quantity" TYPE DECIMAL(14,6);
