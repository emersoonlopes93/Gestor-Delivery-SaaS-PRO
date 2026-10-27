-- Marks only tenants provisioned through the Commercial V1 public signup flow.
-- Existing tenants remain NULL and preserve their legacy navigation behaviour.
ALTER TABLE "tenants"
  ADD COLUMN "commercial_signup_started_at" TIMESTAMP(3);
