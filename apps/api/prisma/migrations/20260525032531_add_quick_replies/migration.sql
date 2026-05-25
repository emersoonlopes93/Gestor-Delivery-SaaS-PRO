-- AlterTable
ALTER TABLE "ai_agent_configs" ADD COLUMN     "debounce_ms" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "simulate_typing" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "quick_replies" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "category" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quick_replies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quick_replies_tenant_id_idx" ON "quick_replies"("tenant_id");

-- AddForeignKey
ALTER TABLE "quick_replies" ADD CONSTRAINT "quick_replies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
