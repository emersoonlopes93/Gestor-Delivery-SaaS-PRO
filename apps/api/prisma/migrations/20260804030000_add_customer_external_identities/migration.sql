-- Add tenant-scoped customer identities for external providers. No backfill is performed.
CREATE TYPE "CustomerIdentityProvider" AS ENUM ('GOOGLE');

CREATE TABLE "customer_external_identities" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "provider" "CustomerIdentityProvider" NOT NULL,
    "provider_subject" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_external_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_external_identities_tenant_id_provider_provider_subject_key"
ON "customer_external_identities"("tenant_id", "provider", "provider_subject");

CREATE UNIQUE INDEX "customer_external_identities_customer_id_provider_key"
ON "customer_external_identities"("customer_id", "provider");

CREATE INDEX "customer_external_identities_tenant_id_customer_id_idx"
ON "customer_external_identities"("tenant_id", "customer_id");

ALTER TABLE "customer_external_identities"
ADD CONSTRAINT "customer_external_identities_tenant_id_fkey"
FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_external_identities"
ADD CONSTRAINT "customer_external_identities_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
