CREATE TYPE "DriverPayMode" AS ENUM ('DRIVER_RATE_TABLE', 'NORMAL_DELIVERY_FEE', 'PERCENTAGE_NORMAL_FEE', 'FIXED');
CREATE TYPE "DriverLedgerEntryType" AS ENUM ('DAILY_RATE', 'DELIVERY_FEE', 'TIP_CASH', 'BONUS', 'ADJUSTMENT');

ALTER TABLE "tenant_settings"
  ADD COLUMN "driver_pay_mode" "DriverPayMode" NOT NULL DEFAULT 'FIXED',
  ADD COLUMN "driver_daily_rate" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "driver_pay_fixed_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "driver_pay_percentage" DECIMAL(5,2) NOT NULL DEFAULT 100,
  ADD COLUMN "driver_pay_rate_table" JSONB,
  ADD COLUMN "driver_pay_failed_attempt" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "orders" ADD COLUMN "normal_delivery_fee" DECIMAL(10,2) NOT NULL DEFAULT 0;
UPDATE "orders" SET "normal_delivery_fee" = "delivery_fee";

ALTER TABLE "delivery_drivers"
  ADD COLUMN "pay_override_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "pay_mode" "DriverPayMode",
  ADD COLUMN "daily_rate" DECIMAL(10,2),
  ADD COLUMN "pay_fixed_amount" DECIMAL(10,2),
  ADD COLUMN "pay_percentage" DECIMAL(5,2),
  ADD COLUMN "pay_rate_table" JSONB,
  ADD COLUMN "pay_failed_attempt" BOOLEAN;

ALTER TABLE "driver_shifts"
  ADD COLUMN "daily_rate_snapshot" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "currency_snapshot" VARCHAR(10) NOT NULL DEFAULT 'BRL',
  ADD COLUMN "pay_snapshot_at" TIMESTAMP(3);

ALTER TABLE "delivery_stops"
  ADD COLUMN "pay_mode_snapshot" "DriverPayMode",
  ADD COLUMN "pay_base_snapshot" DECIMAL(10,2),
  ADD COLUMN "pay_percentage_snapshot" DECIMAL(5,2),
  ADD COLUMN "pay_fixed_snapshot" DECIMAL(10,2),
  ADD COLUMN "pay_rate_table_snapshot" JSONB,
  ADD COLUMN "pay_distance_km_snapshot" DECIMAL(8,3),
  ADD COLUMN "pay_amount_snapshot" DECIMAL(10,2),
  ADD COLUMN "pay_currency_snapshot" VARCHAR(10),
  ADD COLUMN "pay_attempt_snapshot" BOOLEAN,
  ADD COLUMN "pay_snapshot_at" TIMESTAMP(3);

CREATE TABLE "driver_ledger_entries" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "driver_id" TEXT NOT NULL,
  "shift_id" TEXT NOT NULL,
  "run_id" TEXT,
  "stop_id" TEXT,
  "order_id" TEXT,
  "type" "DriverLedgerEntryType" NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "currency" VARCHAR(10) NOT NULL DEFAULT 'BRL',
  "received_directly_by_driver" BOOLEAN NOT NULL DEFAULT false,
  "source" VARCHAR(50) NOT NULL,
  "source_key" VARCHAR(160) NOT NULL,
  "reason" VARCHAR(255),
  "created_by" VARCHAR(100),
  "created_by_type" VARCHAR(30),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "driver_ledger_entries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "driver_ledger_entries_tenant_id_source_key_key" ON "driver_ledger_entries"("tenant_id", "source_key");
CREATE INDEX "driver_ledger_entries_tenant_id_driver_id_shift_id_created_at_idx" ON "driver_ledger_entries"("tenant_id", "driver_id", "shift_id", "created_at");
CREATE INDEX "driver_ledger_entries_tenant_id_order_id_idx" ON "driver_ledger_entries"("tenant_id", "order_id");
ALTER TABLE "driver_ledger_entries" ADD CONSTRAINT "driver_ledger_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "driver_ledger_entries" ADD CONSTRAINT "driver_ledger_entries_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "delivery_drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "driver_ledger_entries" ADD CONSTRAINT "driver_ledger_entries_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "driver_shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "driver_ledger_entries" ADD CONSTRAINT "driver_ledger_entries_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "delivery_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "driver_ledger_entries" ADD CONSTRAINT "driver_ledger_entries_stop_id_fkey" FOREIGN KEY ("stop_id") REFERENCES "delivery_stops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "driver_ledger_entries" ADD CONSTRAINT "driver_ledger_entries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prevent_driver_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'driver ledger entries are immutable';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER driver_ledger_entries_immutable
BEFORE UPDATE OR DELETE ON "driver_ledger_entries"
FOR EACH ROW EXECUTE FUNCTION prevent_driver_ledger_mutation();
