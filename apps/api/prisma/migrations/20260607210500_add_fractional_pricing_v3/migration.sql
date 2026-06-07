-- CreateEnum
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FractionalPricingRule') THEN
        CREATE TYPE "FractionalPricingRule" AS ENUM ('HIGHEST_PRICE', 'AVERAGE_PRICE', 'PROPORTIONAL', 'BASE_PLUS_DIFFERENCE', 'FIXED_PRICE');
    END IF;
END $$;

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN IF NOT EXISTS "fractional_pricing_rule" "FractionalPricingRule";

-- AlterTable
ALTER TABLE "product_categories" ADD COLUMN IF NOT EXISTS "fractional_pricing_rule" "FractionalPricingRule";

-- AlterTable
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "fractional_pricing_rule" "FractionalPricingRule";

-- AlterTable
ALTER TABLE "option_groups" ADD COLUMN IF NOT EXISTS "fractional_pricing_rule" "FractionalPricingRule";
