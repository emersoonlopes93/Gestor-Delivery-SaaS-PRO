CREATE TYPE "DriverSettlementMethod" AS ENUM ('PIX', 'CASH', 'BANK_TRANSFER', 'OTHER');

CREATE TABLE "driver_settlements" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "driver_id" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "currency" VARCHAR(10) NOT NULL DEFAULT 'BRL',
  "payment_method" "DriverSettlementMethod" NOT NULL,
  "paid_at" TIMESTAMP(3) NOT NULL,
  "notes" VARCHAR(500),
  "created_by" VARCHAR(100) NOT NULL,
  "idempotency_key" VARCHAR(160) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "driver_settlements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "driver_settlement_items" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "settlement_id" TEXT NOT NULL,
  "shift_id" TEXT NOT NULL,
  "gross_earnings" DECIMAL(10,2) NOT NULL,
  "received_directly" DECIMAL(10,2) NOT NULL,
  "amount_due" DECIMAL(10,2) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "driver_settlement_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "driver_settlements_tenant_id_idempotency_key_key"
  ON "driver_settlements"("tenant_id", "idempotency_key");
CREATE INDEX "driver_settlements_tenant_id_driver_id_paid_at_idx"
  ON "driver_settlements"("tenant_id", "driver_id", "paid_at");
CREATE UNIQUE INDEX "driver_settlement_items_shift_id_key"
  ON "driver_settlement_items"("shift_id");
CREATE INDEX "driver_settlement_items_tenant_id_settlement_id_idx"
  ON "driver_settlement_items"("tenant_id", "settlement_id");

ALTER TABLE "driver_settlements" ADD CONSTRAINT "driver_settlements_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "driver_settlements" ADD CONSTRAINT "driver_settlements_driver_id_fkey"
  FOREIGN KEY ("driver_id") REFERENCES "delivery_drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "driver_settlement_items" ADD CONSTRAINT "driver_settlement_items_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "driver_settlement_items" ADD CONSTRAINT "driver_settlement_items_settlement_id_fkey"
  FOREIGN KEY ("settlement_id") REFERENCES "driver_settlements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "driver_settlement_items" ADD CONSTRAINT "driver_settlement_items_shift_id_fkey"
  FOREIGN KEY ("shift_id") REFERENCES "driver_shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION reject_driver_settlement_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'confirmed driver settlements are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "driver_settlements_immutable"
BEFORE UPDATE OR DELETE ON "driver_settlements"
FOR EACH ROW EXECUTE FUNCTION reject_driver_settlement_mutation();

CREATE TRIGGER "driver_settlement_items_immutable"
BEFORE UPDATE OR DELETE ON "driver_settlement_items"
FOR EACH ROW EXECUTE FUNCTION reject_driver_settlement_mutation();
