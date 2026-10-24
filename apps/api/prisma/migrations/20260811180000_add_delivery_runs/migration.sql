-- R12: canonical driver shifts and multi-order delivery runs.
-- This migration is additive and intentionally does not synthesize historical runs.

ALTER TABLE "tenant_settings"
  ADD COLUMN "delivery_run_requires_acceptance" BOOLEAN NOT NULL DEFAULT true;

CREATE TYPE "DriverShiftStatus" AS ENUM ('ACTIVE', 'ENDED');
CREATE TYPE "DeliveryRunStatus" AS ENUM (
  'PENDING_ACCEPTANCE',
  'ASSIGNED',
  'IN_PROGRESS',
  'RETURNING',
  'COMPLETED',
  'CANCELLED'
);
CREATE TYPE "DeliveryStopStatus" AS ENUM (
  'PENDING',
  'CURRENT',
  'ARRIVED',
  'DELIVERED',
  'FAILED_ATTEMPT',
  'RETURN_TO_STORE',
  'RETURNED_TO_STORE',
  'CANCELLED'
);

CREATE TABLE "driver_shifts" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "driver_id" TEXT NOT NULL,
  "status" "DriverShiftStatus" NOT NULL DEFAULT 'ACTIVE',
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "driver_shifts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "driver_shifts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "driver_shifts_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "delivery_drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "delivery_runs" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "driver_id" TEXT NOT NULL,
  "shift_id" TEXT NOT NULL,
  "status" "DeliveryRunStatus" NOT NULL DEFAULT 'PENDING_ACCEPTANCE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "history" JSONB NOT NULL DEFAULT '[]',
  "assigned_at" TIMESTAMP(3),
  "accepted_at" TIMESTAMP(3),
  "rejected_at" TIMESTAMP(3),
  "rejection_reason" VARCHAR(255),
  "started_at" TIMESTAMP(3),
  "returning_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "delivery_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "delivery_runs_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "delivery_drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "delivery_runs_shift_id_fkey" FOREIGN KEY ("shift_id") REFERENCES "driver_shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "delivery_runs_version_check" CHECK ("version" > 0)
);

CREATE TABLE "delivery_stops" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "run_id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "status" "DeliveryStopStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "order_number_snapshot" VARCHAR(20) NOT NULL,
  "customer_name_snapshot" VARCHAR(150) NOT NULL,
  "customer_phone_snapshot" VARCHAR(30) NOT NULL,
  "address_snapshot" JSONB,
  "arrived_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "failure_reason" VARCHAR(255),
  "return_required_at" TIMESTAMP(3),
  "returned_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "cancellation_reason" VARCHAR(255),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "delivery_stops_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "delivery_stops_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "delivery_stops_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "delivery_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "delivery_stops_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "delivery_stops_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "delivery_stops_attempts_check" CHECK ("attempts" >= 0)
);

CREATE INDEX "driver_shifts_tenant_id_driver_id_status_idx" ON "driver_shifts"("tenant_id", "driver_id", "status");
CREATE UNIQUE INDEX "driver_shifts_one_active_per_driver_idx" ON "driver_shifts"("tenant_id", "driver_id") WHERE "status" = 'ACTIVE';

CREATE INDEX "delivery_runs_tenant_id_driver_id_status_idx" ON "delivery_runs"("tenant_id", "driver_id", "status");
CREATE INDEX "delivery_runs_tenant_id_shift_id_idx" ON "delivery_runs"("tenant_id", "shift_id");
CREATE UNIQUE INDEX "delivery_runs_one_active_per_driver_idx" ON "delivery_runs"("tenant_id", "driver_id")
  WHERE "status" IN ('PENDING_ACCEPTANCE', 'ASSIGNED', 'IN_PROGRESS', 'RETURNING');

ALTER TABLE "delivery_stops"
  ADD CONSTRAINT "delivery_stops_run_id_sequence_key" UNIQUE ("run_id", "sequence") DEFERRABLE INITIALLY IMMEDIATE;
CREATE INDEX "delivery_stops_tenant_id_run_id_status_idx" ON "delivery_stops"("tenant_id", "run_id", "status");
CREATE INDEX "delivery_stops_tenant_id_order_id_idx" ON "delivery_stops"("tenant_id", "order_id");
CREATE UNIQUE INDEX "delivery_stops_one_active_per_order_idx" ON "delivery_stops"("tenant_id", "order_id")
  WHERE "status" IN ('PENDING', 'CURRENT', 'ARRIVED', 'FAILED_ATTEMPT', 'RETURN_TO_STORE');
CREATE UNIQUE INDEX "delivery_stops_one_current_per_run_idx" ON "delivery_stops"("run_id") WHERE "status" = 'CURRENT';
