ALTER TABLE "tenant_settings"
  ADD COLUMN "automation_cooldown_hours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN "automation_max_messages_per_day" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "campaigns"
  ADD COLUMN "total_clicked" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "revenue_generated" DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "campaign_dispatches"
  ADD COLUMN "clicked_at" TIMESTAMP(3),
  ADD COLUMN "converted_at" TIMESTAMP(3),
  ADD COLUMN "revenue_generated" DECIMAL(10,2) NOT NULL DEFAULT 0;

CREATE INDEX "campaign_dispatches_customer_status_sent_idx"
  ON "campaign_dispatches"("customer_id", "status", "sent_at");
