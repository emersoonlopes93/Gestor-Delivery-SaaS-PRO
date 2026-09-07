-- CreateEnum
CREATE TYPE "PaymentRefundStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "payment_refunds" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "payment_transaction_id" TEXT NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "provider_payment_id" VARCHAR(255) NOT NULL,
    "provider_refund_id" VARCHAR(255),
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'BRL',
    "status" "PaymentRefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "idempotency_key" VARCHAR(160) NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "failure_code" VARCHAR(120),
    "failure_message" VARCHAR(500),
    "provider_status" VARCHAR(120),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_refunds_provider_refund_id_key" ON "payment_refunds"("provider_refund_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_refunds_tenant_id_payment_transaction_id_idempotenc_key" ON "payment_refunds"("tenant_id", "payment_transaction_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "payment_refunds_tenant_id_status_idx" ON "payment_refunds"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "payment_refunds_payment_transaction_id_status_idx" ON "payment_refunds"("payment_transaction_id", "status");

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_payment_transaction_id_fkey" FOREIGN KEY ("payment_transaction_id") REFERENCES "PaymentTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
