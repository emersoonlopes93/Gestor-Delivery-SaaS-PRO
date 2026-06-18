-- CreateEnum
CREATE TYPE "MarketplaceProvider" AS ENUM ('IFOOD', 'UBER_EATS', 'RAPPI', 'FOOD_99', 'KETTA', 'ZE_DELIVERY', 'OTHER');

-- CreateEnum
CREATE TYPE "MarketplaceConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'TOKEN_EXPIRED', 'ERROR', 'PAUSED');

-- CreateEnum
CREATE TYPE "MarketplaceEventStatus" AS ENUM ('RECEIVED', 'QUEUED', 'PROCESSING', 'PROCESSED', 'DUPLICATE', 'FAILED', 'IGNORED');

-- AlterTable
ALTER TABLE "billing_settings" ADD COLUMN     "count_direct_online_orders" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "count_marketplace_99food_orders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "count_marketplace_ifood_orders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "count_marketplace_ketta_orders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "count_marketplace_rappi_orders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "count_marketplace_ubereats_orders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "count_marketplace_ze_delivery_orders" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "source_channel" SET DEFAULT 'direct_online',
ALTER COLUMN "source_channel" SET DATA TYPE VARCHAR(40);

-- CreateTable
CREATE TABLE "marketplace_connections" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "provider" "MarketplaceProvider" NOT NULL,
    "status" "MarketplaceConnectionStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "external_merchant_id" VARCHAR(120),
    "external_store_id" VARCHAR(120),
    "display_name" VARCHAR(160),
    "auth_type" VARCHAR(40),
    "access_token_enc" TEXT,
    "refresh_token_enc" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "scopes_json" JSONB,
    "settings_json" JSONB,
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_event_inbox" (
    "id" TEXT NOT NULL,
    "provider" "MarketplaceProvider" NOT NULL,
    "event_id" VARCHAR(180),
    "tenant_id" TEXT,
    "connection_id" TEXT,
    "external_merchant_id" VARCHAR(120),
    "external_store_id" VARCHAR(120),
    "external_order_id" VARCHAR(120),
    "topic" VARCHAR(120),
    "status" "MarketplaceEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "payload_hash" VARCHAR(128) NOT NULL,
    "dedupe_key" VARCHAR(220) NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "headers_json" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "marketplace_event_inbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_orders" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "provider" "MarketplaceProvider" NOT NULL,
    "external_order_id" VARCHAR(120) NOT NULL,
    "external_display_id" VARCHAR(120),
    "internal_order_id" TEXT,
    "status_external" VARCHAR(60),
    "status_internal" VARCHAR(60),
    "raw_payload" JSONB NOT NULL,
    "normalized_payload" JSONB,
    "imported_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marketplace_connections_tenant_id_provider_idx" ON "marketplace_connections"("tenant_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_connections_tenant_id_provider_key" ON "marketplace_connections"("tenant_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_connections_provider_external_merchant_id_key" ON "marketplace_connections"("provider", "external_merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_connections_provider_external_store_id_key" ON "marketplace_connections"("provider", "external_store_id");

-- CreateIndex
CREATE INDEX "marketplace_event_inbox_provider_external_order_id_idx" ON "marketplace_event_inbox"("provider", "external_order_id");

-- CreateIndex
CREATE INDEX "marketplace_event_inbox_tenant_id_status_idx" ON "marketplace_event_inbox"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "marketplace_event_inbox_status_received_at_idx" ON "marketplace_event_inbox"("status", "received_at");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_event_inbox_provider_dedupe_key_key" ON "marketplace_event_inbox"("provider", "dedupe_key");

-- CreateIndex
CREATE INDEX "marketplace_orders_internal_order_id_idx" ON "marketplace_orders"("internal_order_id");

-- CreateIndex
CREATE INDEX "marketplace_orders_connection_id_idx" ON "marketplace_orders"("connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "marketplace_orders_tenant_id_provider_external_order_id_key" ON "marketplace_orders"("tenant_id", "provider", "external_order_id");

-- AddForeignKey
ALTER TABLE "marketplace_connections" ADD CONSTRAINT "marketplace_connections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_event_inbox" ADD CONSTRAINT "marketplace_event_inbox_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_event_inbox" ADD CONSTRAINT "marketplace_event_inbox_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "marketplace_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "marketplace_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketplace_orders" ADD CONSTRAINT "marketplace_orders_internal_order_id_fkey" FOREIGN KEY ("internal_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

