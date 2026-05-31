-- Idempotency constraints for billing cycle close and draft invoices.
CREATE UNIQUE INDEX "billing_cycles_subscription_id_started_at_ended_at_key"
ON "billing_cycles"("subscription_id", "started_at", "ended_at");

CREATE UNIQUE INDEX "billing_usage_snapshots_tenant_id_cycle_id_period_start_period_end_key"
ON "billing_usage_snapshots"("tenant_id", "cycle_id", "period_start", "period_end");

CREATE UNIQUE INDEX "invoices_tenant_id_subscription_id_cycle_id_key"
ON "invoices"("tenant_id", "subscription_id", "cycle_id");

CREATE UNIQUE INDEX "invoice_items_invoice_id_type_key"
ON "invoice_items"("invoice_id", "type");
