-- 99Food Financial API contract closure. Additive facts; no historical inference or posting.
ALTER TYPE "MarketplaceOperationType" ADD VALUE 'PAY_CONFIRM';

ALTER TABLE "marketplace_bill_entries"
  ADD COLUMN "order_index" VARCHAR(120),
  ADD COLUMN "delivery_type" INTEGER,
  ADD COLUMN "meal_original_amount" BIGINT,
  ADD COLUMN "shop_delivery_amount" BIGINT,
  ADD COLUMN "shop_pre_tips" BIGINT,
  ADD COLUMN "free_delivery_outcome" BIGINT,
  ADD COLUMN "free_delivery_subsidy" BIGINT,
  ADD COLUMN "commission_base_amount" BIGINT,
  ADD COLUMN "commission_subsidy_amount" BIGINT,
  ADD COLUMN "b2p_delivery_amount" BIGINT,
  ADD COLUMN "pay_commission_amount" BIGINT,
  ADD COLUMN "min_value_difference_amount" BIGINT,
  ADD COLUMN "meal_loss_deduct_amount" BIGINT,
  ADD COLUMN "vat_amount" BIGINT,
  ADD COLUMN "merchant_appeal_amount" BIGINT,
  ADD COLUMN "monthly_service_price" BIGINT,
  ADD COLUMN "gmv" BIGINT,
  ADD COLUMN "monthly_service_base_price" BIGINT;

ALTER TABLE "marketplace_settlements"
  ADD COLUMN "payee_cnpj" VARCHAR(32),
  ADD COLUMN "payer_cnpj" VARCHAR(32),
  ADD COLUMN "cnpj_withdraw_amount" BIGINT,
  ADD COLUMN "cerc_amount" BIGINT;

-- Existing uniqueness proves no pre-existing collision; connection scope reflects provider payment identity per shop.
DROP INDEX "marketplace_settlement_identity_key";
CREATE UNIQUE INDEX "marketplace_settlement_identity_key"
  ON "marketplace_settlements"("tenant_id", "provider", "connection_id", "week_payment_id");
