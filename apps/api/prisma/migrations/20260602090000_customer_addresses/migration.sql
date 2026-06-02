-- Customer saved addresses for professional POS phone/delivery flow.
CREATE TABLE "customer_addresses" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "label" VARCHAR(80),
  "street" VARCHAR(255) NOT NULL,
  "number" VARCHAR(20) NOT NULL,
  "complement" VARCHAR(100),
  "neighborhood" VARCHAR(100) NOT NULL,
  "city" VARCHAR(100) NOT NULL DEFAULT 'Nao informado',
  "state" VARCHAR(2) NOT NULL DEFAULT 'NA',
  "zip_code" VARCHAR(10) NOT NULL DEFAULT '00000000',
  "reference" VARCHAR(255),
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_addresses_tenant_id_idx" ON "customer_addresses"("tenant_id");
CREATE INDEX "customer_addresses_customer_id_idx" ON "customer_addresses"("customer_id");

ALTER TABLE "customer_addresses"
  ADD CONSTRAINT "customer_addresses_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_addresses"
  ADD CONSTRAINT "customer_addresses_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
