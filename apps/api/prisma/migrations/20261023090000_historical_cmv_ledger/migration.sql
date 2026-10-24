-- Historical CMV is a read model over the physical stock ledger. These fields
-- are nullable/additive for legacy StockMovement rows and never backfill cost
-- provenance from Ingredient.currentCost or a numeric default of zero.
CREATE TYPE "HistoricalCostEvidence" AS ENUM ('known', 'unknown');
CREATE TYPE "HistoricalCmvCoverage" AS ENUM ('known', 'partial');

ALTER TABLE "ingredients"
  ADD COLUMN "current_cost_evidence" "HistoricalCostEvidence" NOT NULL DEFAULT 'unknown';

ALTER TABLE "stock_movements"
  ADD COLUMN "cost_evidence" "HistoricalCostEvidence",
  ADD COLUMN "order_cmv_coverage" "HistoricalCmvCoverage";

CREATE INDEX "stock_movements_tenant_order_type_coverage_idx"
  ON "stock_movements"("tenant_id", "order_id", "type", "order_cmv_coverage");
