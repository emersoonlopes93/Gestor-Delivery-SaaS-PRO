-- AlterTable
ALTER TABLE "products" ADD COLUMN     "compare_at_price" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "TenantSettings" ADD COLUMN     "minimum_order_value" DECIMAL(10,2);
