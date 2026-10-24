-- Bring the physical table in line with ProductOptionItemPrice after the
-- product-level availability override was introduced.
ALTER TABLE "product_option_item_prices"
  ADD COLUMN "is_active" BOOLEAN;

ALTER TABLE "product_option_item_prices"
  ALTER COLUMN "price" DROP NOT NULL;
