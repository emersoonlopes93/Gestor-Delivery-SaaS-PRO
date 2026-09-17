ALTER TABLE "purchase_items"
  ADD COLUMN "purchase_unit" "UnitType",
  ADD COLUMN "base_quantity" DECIMAL(10,4),
  ADD COLUMN "base_unit_cost" DECIMAL(10,4);
