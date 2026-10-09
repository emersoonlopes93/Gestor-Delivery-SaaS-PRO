-- Existing running campaigns continue processing. Paused campaigns must remain
-- non-dispatchable, so cancellation is the safest terminal compatibility state.
ALTER TYPE "CampaignStatus" RENAME TO "CampaignStatus_legacy";
CREATE TYPE "CampaignStatus" AS ENUM (
  'draft', 'scheduled', 'queued', 'processing', 'completed', 'failed', 'cancelled'
);
ALTER TABLE "campaigns" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "campaigns"
  ALTER COLUMN "status" TYPE "CampaignStatus"
  USING (
    CASE "status"::text
      WHEN 'running' THEN 'processing'
      WHEN 'paused' THEN 'cancelled'
      ELSE "status"::text
    END
  )::"CampaignStatus";
ALTER TABLE "campaigns" ALTER COLUMN "status" SET DEFAULT 'draft';
UPDATE "campaigns"
SET "cancelled_at" = COALESCE("cancelled_at", CURRENT_TIMESTAMP)
WHERE "status" = 'cancelled' AND "cancelled_at" IS NULL;
DROP TYPE "CampaignStatus_legacy";

-- Inbound opt-out must also work before a phone has been linked to a customer.
ALTER TABLE "customer_opt_outs" ALTER COLUMN "customer_id" DROP NOT NULL;
ALTER TABLE "customer_opt_outs" DROP CONSTRAINT "customer_opt_outs_customer_id_fkey";
ALTER TABLE "customer_opt_outs"
  ADD CONSTRAINT "customer_opt_outs_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Evolution sends this identifier in webhooks. Refuse an ambiguous historical
-- database rather than guessing a tenant during authentication.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "whatsapp_instances"
    WHERE "evolution_instance_id" IS NOT NULL
    GROUP BY "evolution_instance_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add unique evolution_instance_id: duplicate non-null values exist in whatsapp_instances';
  END IF;
END $$;
CREATE UNIQUE INDEX "whatsapp_instances_evolution_instance_id_key"
  ON "whatsapp_instances"("evolution_instance_id");

ALTER TYPE "CampaignDispatchStatus" RENAME TO "CampaignDispatchStatus_legacy";
CREATE TYPE "CampaignDispatchStatus" AS ENUM (
  'queued', 'processing', 'sending', 'sent', 'delivered', 'read', 'replied',
  'failed', 'opt_out', 'unknown', 'cancelled'
);
ALTER TABLE "campaign_dispatches" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "campaign_dispatches"
  ALTER COLUMN "status" TYPE "CampaignDispatchStatus"
  USING "status"::text::"CampaignDispatchStatus";
ALTER TABLE "campaign_dispatches" ALTER COLUMN "status" SET DEFAULT 'queued';
DROP TYPE "CampaignDispatchStatus_legacy";

ALTER TABLE "campaign_dispatches"
  ADD COLUMN "idempotency_key" VARCHAR(180),
  ADD COLUMN "next_attempt_at" TIMESTAMP(3),
  ADD COLUMN "provider_accepted_at" TIMESTAMP(3),
  ADD COLUMN "reconciliation_required" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0;
UPDATE "campaign_dispatches"
SET "idempotency_key" = 'campaign:' || "campaign_id" || ':dispatch:' || "id"
WHERE "idempotency_key" IS NULL;
ALTER TABLE "campaign_dispatches" ALTER COLUMN "idempotency_key" SET NOT NULL;
CREATE UNIQUE INDEX "campaign_dispatches_idempotency_key_key"
  ON "campaign_dispatches"("idempotency_key");
CREATE INDEX "campaign_dispatches_campaign_id_status_next_attempt_at_idx"
  ON "campaign_dispatches"("campaign_id", "status", "next_attempt_at");
