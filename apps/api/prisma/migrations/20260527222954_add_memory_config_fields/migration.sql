/*
  Warnings:

  - Added the required column `external_status` to the `chat_messages` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "MessageSenderType" AS ENUM ('customer', 'ai', 'human', 'system');

-- CreateEnum
CREATE TYPE "MessageExternalStatus" AS ENUM ('sent', 'delivered', 'read', 'failed');

-- AlterTable
ALTER TABLE "ai_agent_configs" ADD COLUMN     "allow_repeat_last_order" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "memory_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "memory_retention_days" INTEGER NOT NULL DEFAULT 180,
ADD COLUMN     "remember_addresses" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "remember_customer_name" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "remember_last_order" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "remember_preferences" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "debounce_ms" SET DEFAULT 10000;

-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "external_status" "MessageExternalStatus" NOT NULL,
ADD COLUMN     "senderType" "MessageSenderType" NOT NULL DEFAULT 'customer',
ADD COLUMN     "timestamp" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "chat_sessions" ADD COLUMN     "channel" VARCHAR(30) NOT NULL DEFAULT 'whatsapp',
ADD COLUMN     "display_name" VARCHAR(150),
ADD COLUMN     "remote_jid" VARCHAR(100),
ADD COLUMN     "unread_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "tenant_settings" ALTER COLUMN "new_order_sound" SET DEFAULT 'notification.mp3',
ALTER COLUMN "cancellation_sound" SET DEFAULT 'notification.mp3';

-- AlterTable
ALTER TABLE "whatsapp_instances" ADD COLUMN     "qr_code" TEXT;
