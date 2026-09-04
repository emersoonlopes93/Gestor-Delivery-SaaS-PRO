CREATE TYPE "MarketplaceDeliveryOwnership" AS ENUM ('MERCHANT', 'PROVIDER', 'UNKNOWN');

ALTER TABLE "marketplace_orders"
  ADD COLUMN "delivery_ownership" "MarketplaceDeliveryOwnership" NOT NULL DEFAULT 'UNKNOWN';
