-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'theoretical_reversal';

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN "reversal_of_movement_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_reversal_of_movement_id_key" ON "stock_movements"("reversal_of_movement_id");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_order_id_type_idx" ON "stock_movements"("tenant_id", "order_id", "type");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reversal_of_movement_id_fkey" FOREIGN KEY ("reversal_of_movement_id") REFERENCES "stock_movements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
