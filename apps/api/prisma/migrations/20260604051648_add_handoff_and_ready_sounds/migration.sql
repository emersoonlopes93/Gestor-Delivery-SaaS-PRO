-- AlterTable
ALTER TABLE "products" ADD COLUMN     "media_asset_id" TEXT;

-- AlterTable
ALTER TABLE "system_configs" ADD COLUMN     "anthropic_model" VARCHAR(100) DEFAULT 'claude-3-5-sonnet-20240620',
ADD COLUMN     "fallback_ai_model" VARCHAR(100),
ADD COLUMN     "fallback_ai_provider" VARCHAR(50),
ADD COLUMN     "openai_model" VARCHAR(100) DEFAULT 'gpt-4o';

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "storefront_layout_json" JSONB,
ADD COLUMN     "storefront_theme_json" JSONB,
ALTER COLUMN "handoff_sound" SET DATA TYPE TEXT,
ALTER COLUMN "ready_sound" SET DATA TYPE TEXT;

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "scope" VARCHAR(50) NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "title" VARCHAR(150),
    "description" TEXT,
    "category" VARCHAR(50),
    "category_id" TEXT,
    "filename" VARCHAR(255) NOT NULL,
    "original_name" VARCHAR(255),
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "path" TEXT NOT NULL,
    "storage_provider" VARCHAR(30) NOT NULL DEFAULT 'local',
    "storage_key" TEXT,
    "public_url" TEXT NOT NULL,
    "checksum" VARCHAR(128),
    "alt_text" VARCHAR(255),
    "metadata_json" JSONB,
    "tags_json" JSONB,
    "status" VARCHAR(30) NOT NULL DEFAULT 'active',
    "publication_status" VARCHAR(30) NOT NULL DEFAULT 'published',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_categories" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "scope" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "media_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_assets_tenant_id_idx" ON "media_assets"("tenant_id");

-- CreateIndex
CREATE INDEX "media_assets_scope_idx" ON "media_assets"("scope");

-- CreateIndex
CREATE INDEX "media_assets_is_system_idx" ON "media_assets"("is_system");

-- CreateIndex
CREATE INDEX "media_assets_category_idx" ON "media_assets"("category");

-- CreateIndex
CREATE INDEX "media_assets_category_id_idx" ON "media_assets"("category_id");

-- CreateIndex
CREATE INDEX "media_assets_status_idx" ON "media_assets"("status");

-- CreateIndex
CREATE INDEX "media_assets_publication_status_idx" ON "media_assets"("publication_status");

-- CreateIndex
CREATE INDEX "media_assets_deleted_at_idx" ON "media_assets"("deleted_at");

-- CreateIndex
CREATE INDEX "media_categories_tenant_id_idx" ON "media_categories"("tenant_id");

-- CreateIndex
CREATE INDEX "media_categories_scope_idx" ON "media_categories"("scope");

-- CreateIndex
CREATE INDEX "media_categories_is_active_idx" ON "media_categories"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "media_categories_tenant_id_scope_slug_key" ON "media_categories"("tenant_id", "scope", "slug");

-- CreateIndex
CREATE INDEX "products_media_asset_id_idx" ON "products"("media_asset_id");

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "media_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_categories" ADD CONSTRAINT "media_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_media_asset_id_fkey" FOREIGN KEY ("media_asset_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "billing_usage_snapshots_tenant_id_cycle_id_period_start_period_" RENAME TO "billing_usage_snapshots_tenant_id_cycle_id_period_start_per_key";
