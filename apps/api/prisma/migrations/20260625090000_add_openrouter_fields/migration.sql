-- AlterTable
ALTER TABLE "system_configs"
  ADD COLUMN IF NOT EXISTS "google_ai_api_key" TEXT,
  ADD COLUMN IF NOT EXISTS "google_ai_model" VARCHAR(100) DEFAULT 'gemini-1.5-flash',
  ADD COLUMN IF NOT EXISTS "openrouter_api_key" TEXT,
  ADD COLUMN IF NOT EXISTS "openrouter_model" VARCHAR(100) DEFAULT 'openrouter/auto',
  ADD COLUMN IF NOT EXISTS "openai_model" VARCHAR(100) DEFAULT 'gpt-4o',
  ADD COLUMN IF NOT EXISTS "anthropic_model" VARCHAR(100) DEFAULT 'claude-3-5-sonnet-20240620',
  ADD COLUMN IF NOT EXISTS "fallback_ai_provider" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "fallback_ai_model" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "ai_default_agent_name" VARCHAR(100) NOT NULL DEFAULT 'Assistente',
  ADD COLUMN IF NOT EXISTS "ai_default_tone" VARCHAR(30) NOT NULL DEFAULT 'friendly',
  ADD COLUMN IF NOT EXISTS "ai_memory_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ai_remember_customer_name" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ai_remember_addresses" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ai_remember_last_order" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ai_remember_preferences" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ai_allow_repeat_last_order" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ai_memory_retention_days" INTEGER NOT NULL DEFAULT 180,
  ADD COLUMN IF NOT EXISTS "ai_debounce_ms" INTEGER NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS "ai_simulate_typing" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "ai_require_customer_name" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ai_require_confirmation" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "ai_enable_upsell" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "ai_enable_human_handoff" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "ai_session_timeout_min" INTEGER NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS "ai_close_on_exit_command" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "ai_exit_commands" TEXT[],
  ADD COLUMN IF NOT EXISTS "ai_reset_draft_on_session_close" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "ai_max_retries" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "ai_daily_message_limit" INTEGER NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS "ai_customer_cooldown_min" INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "ai_agent_configs"
  ADD COLUMN IF NOT EXISTS "human_intervention_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "human_intervention_minutes" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS "resume_automatically" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "simulate_typing" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "close_on_exit_command" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "exit_commands" TEXT[],
  ADD COLUMN IF NOT EXISTS "reset_draft_on_session_close" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "tenant_users"
  ADD COLUMN IF NOT EXISTS "password_reset_token" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "password_reset_expires" TIMESTAMP(3);
