-- CreateEnum
CREATE TYPE "FinancialProjectionSource" AS ENUM ('PEDEHUB', 'POS', 'IFOOD', 'FOOD_99');

-- CreateEnum
CREATE TYPE "FinancialProjectionValueState" AS ENUM ('KNOWN', 'UNKNOWN', 'NOT_APPLICABLE');

-- CreateTable
CREATE TABLE "financial_projections" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "source" "FinancialProjectionSource" NOT NULL,
    "projection_version" INTEGER NOT NULL DEFAULT 1,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "recognized_at" TIMESTAMP(3),
    "payment_observed_at" TIMESTAMP(3),
    "sale_gross" DECIMAL(12,2),
    "sale_gross_state" "FinancialProjectionValueState" NOT NULL,
    "discount_total" DECIMAL(12,2),
    "discount_total_state" "FinancialProjectionValueState" NOT NULL,
    "discount_merchant" DECIMAL(12,2),
    "discount_merchant_state" "FinancialProjectionValueState" NOT NULL,
    "discount_platform" DECIMAL(12,2),
    "discount_platform_state" "FinancialProjectionValueState" NOT NULL,
    "delivery_charged" DECIMAL(12,2),
    "delivery_charged_state" "FinancialProjectionValueState" NOT NULL,
    "service_charged" DECIMAL(12,2),
    "service_charged_state" "FinancialProjectionValueState" NOT NULL,
    "customer_paid" DECIMAL(12,2),
    "customer_paid_state" "FinancialProjectionValueState" NOT NULL,
    "payment_method" "PaymentMethod",
    "payment_channel" VARCHAR(80),
    "marketplace_fee" DECIMAL(12,2),
    "marketplace_fee_state" "FinancialProjectionValueState" NOT NULL,
    "merchant_receivable" DECIMAL(12,2),
    "merchant_receivable_state" "FinancialProjectionValueState" NOT NULL,
    "refund_amount" DECIMAL(12,2),
    "refund_state" "FinancialProjectionValueState" NOT NULL,
    "cogs_snapshot" DECIMAL(12,2),
    "cogs_state" "FinancialProjectionValueState" NOT NULL,
    "source_field_provenance" JSONB NOT NULL,
    "source_payload_reference" VARCHAR(160),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_projections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "financial_projections_tenant_id_order_id_projection_version_key" ON "financial_projections"("tenant_id", "order_id", "projection_version");

-- CreateIndex
CREATE INDEX "financial_projections_tenant_id_source_occurred_at_idx" ON "financial_projections"("tenant_id", "source", "occurred_at");

-- CreateIndex
CREATE INDEX "financial_projections_tenant_id_order_id_idx" ON "financial_projections"("tenant_id", "order_id");

-- AddForeignKey
ALTER TABLE "financial_projections" ADD CONSTRAINT "financial_projections_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_projections" ADD CONSTRAINT "financial_projections_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
