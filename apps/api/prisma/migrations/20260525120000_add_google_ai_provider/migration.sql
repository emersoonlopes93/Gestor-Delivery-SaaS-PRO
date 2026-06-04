-- AlterEnum
ALTER TYPE "AiProviderType" ADD VALUE 'google_ai';

-- AlterTable
ALTER TABLE "system_configs" ADD COLUMN "google_ai_api_key" TEXT;
ALTER TABLE "system_configs" ADD COLUMN "google_ai_model" VARCHAR(100) DEFAULT 'gemini-2.5-flash';
