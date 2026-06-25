-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "CampaignType" AS ENUM ('whatsapp_message', 'whatsapp_status');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable campaigns
ALTER TABLE "campaigns" 
  ADD COLUMN IF NOT EXISTS "type" "CampaignType" NOT NULL DEFAULT 'whatsapp_message',
  ADD COLUMN IF NOT EXISTS "media_type" VARCHAR(50);

-- AlterTable tenant_settings
ALTER TABLE "tenant_settings" 
  ADD COLUMN IF NOT EXISTS "handoff_sound" TEXT DEFAULT 'notification.mp3',
  ADD COLUMN IF NOT EXISTS "ready_sound" TEXT DEFAULT 'notification.mp3',
  ADD COLUMN IF NOT EXISTS "browser_notifications_enabled" BOOLEAN DEFAULT true;

-- AlterTable order_items
ALTER TABLE "order_items" 
  ADD COLUMN IF NOT EXISTS "snapshot_fractional_pricing" JSONB;

-- AlterTable customers
ALTER TABLE "customers" 
  ADD COLUMN IF NOT EXISTS "profile_picture_url" TEXT,
  ADD COLUMN IF NOT EXISTS "profile_picture_updated_at" TIMESTAMP(3);

-- AlterTable print_jobs
ALTER TABLE "print_jobs" 
  ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "max_attempts" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "locked_by" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "last_error" TEXT,
  ADD COLUMN IF NOT EXISTS "idempotency_key" VARCHAR(128),
  ADD COLUMN IF NOT EXISTS "printer_device_id" TEXT,
  ADD COLUMN IF NOT EXISTS "payload_type" VARCHAR(50) NOT NULL DEFAULT 'plain_text',
  ADD COLUMN IF NOT EXISTS "metadata" JSONB,
  ADD COLUMN IF NOT EXISTS "failed_at" TIMESTAMP(3);

-- CreateIndex print_jobs idempotency key
DO $$ BEGIN
    CREATE UNIQUE INDEX "print_jobs_idempotency_key_key" ON "print_jobs"("idempotency_key");
EXCEPTION
    WHEN duplicate_table OR duplicate_relation THEN null;
END $$;

-- AlterTable chat_sessions
ALTER TABLE "chat_sessions" 
  ADD COLUMN IF NOT EXISTS "handoff_until" TIMESTAMP(3);

-- CreateTable marketing_automations
CREATE TABLE IF NOT EXISTS "marketing_automations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "message_template" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_automations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex marketing_automations unique and index
DO $$ BEGIN
    CREATE UNIQUE INDEX "marketing_automations_tenant_id_type_key" ON "marketing_automations"("tenant_id", "type");
EXCEPTION
    WHEN duplicate_table OR duplicate_relation THEN null;
END $$;

DO $$ BEGIN
    CREATE INDEX "marketing_automations_tenant_id_idx" ON "marketing_automations"("tenant_id");
EXCEPTION
    WHEN duplicate_table OR duplicate_relation THEN null;
END $$;

-- AddForeignKey marketing_automations
DO $$ BEGIN
    ALTER TABLE "marketing_automations" ADD CONSTRAINT "marketing_automations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable order_feedbacks
CREATE TABLE IF NOT EXISTS "order_feedbacks" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "customer_id" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "source" TEXT NOT NULL DEFAULT 'post_delivery_feedback',
    "public_review_clicked" BOOLEAN NOT NULL DEFAULT false,
    "clicked_channel" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes order_feedbacks
DO $$ BEGIN
    CREATE UNIQUE INDEX "order_feedbacks_order_id_key" ON "order_feedbacks"("order_id");
EXCEPTION
    WHEN duplicate_table OR duplicate_relation THEN null;
END $$;

DO $$ BEGIN
    CREATE INDEX "order_feedbacks_tenant_id_idx" ON "order_feedbacks"("tenant_id");
EXCEPTION
    WHEN duplicate_table OR duplicate_relation THEN null;
END $$;

DO $$ BEGIN
    CREATE INDEX "order_feedbacks_customer_id_idx" ON "order_feedbacks"("customer_id");
EXCEPTION
    WHEN duplicate_table OR duplicate_relation THEN null;
END $$;

-- AddForeignKeys order_feedbacks
DO $$ BEGIN
    ALTER TABLE "order_feedbacks" ADD CONSTRAINT "order_feedbacks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "order_feedbacks" ADD CONSTRAINT "order_feedbacks_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "order_feedbacks" ADD CONSTRAINT "order_feedbacks_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
