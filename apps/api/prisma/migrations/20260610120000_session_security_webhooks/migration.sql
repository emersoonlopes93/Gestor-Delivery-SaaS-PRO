CREATE TYPE "AuthSubjectType" AS ENUM ('admin', 'tenant', 'driver', 'customer');
CREATE TYPE "AuthSessionStatus" AS ENUM ('active', 'rotated', 'revoked', 'expired', 'compromised');
CREATE TYPE "WebhookEventStatus" AS ENUM ('received', 'processing', 'processed', 'failed', 'ignored', 'duplicate', 'rejected');

CREATE TABLE "auth_sessions" (
  "id" TEXT NOT NULL,
  "subject_type" "AuthSubjectType" NOT NULL,
  "subject_id" TEXT NOT NULL,
  "tenant_id" TEXT,
  "admin_user_id" TEXT,
  "user_id" TEXT,
  "role" VARCHAR(80),
  "refresh_token_hash" VARCHAR(128) NOT NULL,
  "refresh_token_family_id" VARCHAR(64) NOT NULL,
  "previous_session_id" TEXT,
  "user_agent" VARCHAR(500),
  "ip_address" VARCHAR(45),
  "device_label" VARCHAR(120),
  "status" "AuthSessionStatus" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "revoked_reason" VARCHAR(120),
  "replaced_by_session_id" TEXT,
  "metadata" JSONB,
  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "external_webhook_events" (
  "id" TEXT NOT NULL,
  "provider" VARCHAR(60) NOT NULL,
  "event_id" VARCHAR(180) NOT NULL,
  "signature_hash" VARCHAR(128),
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  "status" "WebhookEventStatus" NOT NULL DEFAULT 'received',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "payload_hash" VARCHAR(128) NOT NULL,
  "tenant_id" TEXT,
  "related_entity_type" VARCHAR(80),
  "related_entity_id" VARCHAR(120),
  "metadata" JSONB,
  CONSTRAINT "external_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "auth_sessions_subject_type_subject_id_idx" ON "auth_sessions"("subject_type", "subject_id");
CREATE INDEX "auth_sessions_tenant_id_idx" ON "auth_sessions"("tenant_id");
CREATE INDEX "auth_sessions_admin_user_id_idx" ON "auth_sessions"("admin_user_id");
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");
CREATE INDEX "auth_sessions_refresh_token_family_id_idx" ON "auth_sessions"("refresh_token_family_id");
CREATE INDEX "auth_sessions_status_idx" ON "auth_sessions"("status");

CREATE UNIQUE INDEX "external_webhook_events_provider_event_id_key" ON "external_webhook_events"("provider", "event_id");
CREATE INDEX "external_webhook_events_provider_status_idx" ON "external_webhook_events"("provider", "status");
CREATE INDEX "external_webhook_events_tenant_id_idx" ON "external_webhook_events"("tenant_id");
CREATE INDEX "external_webhook_events_payload_hash_idx" ON "external_webhook_events"("payload_hash");
