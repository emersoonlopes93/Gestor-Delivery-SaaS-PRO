-- Multi-iFood Foundation V1
-- Existing MarketplaceConnection rows remain the first connection for each tenant/provider.
-- The provider/merchant and provider/store constraints continue to prevent a merchant
-- from being associated with more than one tenant.

DROP INDEX "marketplace_connections_tenant_id_provider_key";

CREATE INDEX "marketplace_connections_tenant_id_provider_status_idx"
ON "marketplace_connections"("tenant_id", "provider", "status");

DROP INDEX "marketplace_orders_tenant_id_provider_external_order_id_key";

CREATE UNIQUE INDEX "marketplace_orders_connection_id_provider_external_order_id_key"
ON "marketplace_orders"("connection_id", "provider", "external_order_id");

CREATE INDEX "marketplace_orders_tenant_id_provider_external_order_id_idx"
ON "marketplace_orders"("tenant_id", "provider", "external_order_id");
