-- Additive canonical authorship for purchase presentations. Existing rows remain
-- intentionally null because labels and old factors are not authoritative inputs.
ALTER TABLE "purchase_presentations"
  ADD COLUMN "content_quantity" DECIMAL(14,6),
  ADD COLUMN "content_unit" "UnitType",
  ADD COLUMN "archived_at" TIMESTAMP(3);

-- Immutable snapshots for purchases created after this migration. Historical rows
-- keep nulls rather than receiving guessed commercial or base-unit metadata.
ALTER TABLE "purchase_items"
  ADD COLUMN "purchase_presentation_content_quantity_snapshot" DECIMAL(14,6),
  ADD COLUMN "purchase_presentation_content_unit_snapshot" "UnitType",
  ADD COLUMN "ingredient_base_unit_snapshot" "UnitType";
