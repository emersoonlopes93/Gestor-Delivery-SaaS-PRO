-- AlterTable
ALTER TABLE "ai_agent_configs" ADD COLUMN     "use_global_defaults" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "system_configs" ADD COLUMN     "ai_allow_repeat_last_order" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ai_debounce_ms" INTEGER NOT NULL DEFAULT 10000,
ADD COLUMN     "ai_default_agent_name" VARCHAR(100) NOT NULL DEFAULT 'Assistente',
ADD COLUMN     "ai_default_tone" VARCHAR(30) NOT NULL DEFAULT 'friendly',
ADD COLUMN     "ai_enable_human_handoff" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ai_enable_upsell" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ai_memory_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ai_memory_retention_days" INTEGER NOT NULL DEFAULT 180,
ADD COLUMN     "ai_remember_addresses" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ai_remember_customer_name" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ai_remember_last_order" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ai_remember_preferences" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ai_require_confirmation" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "ai_require_customer_name" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ai_simulate_typing" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ai_agent_plan_presets" (
    "id" TEXT NOT NULL,
    "plan" VARCHAR(30) NOT NULL,
    "memory_allowed" BOOLEAN NOT NULL DEFAULT false,
    "repeat_last_order_allowed" BOOLEAN NOT NULL DEFAULT false,
    "max_retention_days" INTEGER NOT NULL DEFAULT 90,
    "advanced_tools_allowed" BOOLEAN NOT NULL DEFAULT false,
    "custom_prompt_allowed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_agent_plan_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ai_agent_plan_presets_plan_key" ON "ai_agent_plan_presets"("plan");
