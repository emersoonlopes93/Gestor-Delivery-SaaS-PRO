-- Base Menu Templates become the DB-backed source of truth for tenant menu imports.

CREATE TYPE "BaseMenuPublicationStatus" AS ENUM ('draft', 'published', 'archived');
CREATE TYPE "BaseMenuImportStatus" AS ENUM ('success', 'partial', 'failed');

CREATE TABLE "base_menu_templates" (
  "id" TEXT NOT NULL,
  "slug" VARCHAR(80) NOT NULL,
  "name" VARCHAR(140) NOT NULL,
  "description" TEXT,
  "segment" VARCHAR(80) NOT NULL,
  "icon" VARCHAR(20),
  "status" "BaseMenuPublicationStatus" NOT NULL DEFAULT 'draft',
  "current_published_version_id" TEXT,
  "metadata_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "base_menu_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "base_menu_template_versions" (
  "id" TEXT NOT NULL,
  "template_id" TEXT NOT NULL,
  "version_number" INTEGER NOT NULL,
  "status" "BaseMenuPublicationStatus" NOT NULL DEFAULT 'draft',
  "published_at" TIMESTAMP(3),
  "metadata_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "base_menu_template_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "base_menu_categories" (
  "id" TEXT NOT NULL,
  "version_id" TEXT NOT NULL,
  "slug" VARCHAR(100) NOT NULL,
  "name" VARCHAR(140) NOT NULL,
  "description" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "metadata_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "base_menu_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "base_menu_products" (
  "id" TEXT NOT NULL,
  "category_id" TEXT NOT NULL,
  "slug" VARCHAR(120) NOT NULL,
  "name" VARCHAR(180) NOT NULL,
  "description" TEXT,
  "base_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "compare_at_price" DECIMAL(10,2),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "media_lookup_key" VARCHAR(160),
  "search_tags_json" JSONB NOT NULL DEFAULT '[]',
  "metadata_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "base_menu_products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "base_menu_import_logs" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "template_id" TEXT NOT NULL,
  "version_id" TEXT NOT NULL,
  "status" "BaseMenuImportStatus" NOT NULL,
  "categories_created" INTEGER NOT NULL DEFAULT 0,
  "products_created" INTEGER NOT NULL DEFAULT 0,
  "categories_skipped" INTEGER NOT NULL DEFAULT 0,
  "products_skipped" INTEGER NOT NULL DEFAULT 0,
  "metadata_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "base_menu_import_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "base_menu_templates_slug_key" ON "base_menu_templates"("slug");
CREATE UNIQUE INDEX "base_menu_templates_current_published_version_id_key" ON "base_menu_templates"("current_published_version_id");
CREATE INDEX "base_menu_templates_status_idx" ON "base_menu_templates"("status");
CREATE INDEX "base_menu_templates_segment_idx" ON "base_menu_templates"("segment");

CREATE UNIQUE INDEX "base_menu_template_versions_template_id_version_number_key" ON "base_menu_template_versions"("template_id", "version_number");
CREATE INDEX "base_menu_template_versions_template_id_status_idx" ON "base_menu_template_versions"("template_id", "status");

CREATE UNIQUE INDEX "base_menu_categories_version_id_slug_key" ON "base_menu_categories"("version_id", "slug");
CREATE INDEX "base_menu_categories_version_id_sort_order_idx" ON "base_menu_categories"("version_id", "sort_order");

CREATE UNIQUE INDEX "base_menu_products_category_id_slug_key" ON "base_menu_products"("category_id", "slug");
CREATE INDEX "base_menu_products_category_id_sort_order_idx" ON "base_menu_products"("category_id", "sort_order");
CREATE INDEX "base_menu_products_media_lookup_key_idx" ON "base_menu_products"("media_lookup_key");

CREATE INDEX "base_menu_import_logs_tenant_id_idx" ON "base_menu_import_logs"("tenant_id");
CREATE INDEX "base_menu_import_logs_template_id_idx" ON "base_menu_import_logs"("template_id");
CREATE INDEX "base_menu_import_logs_version_id_idx" ON "base_menu_import_logs"("version_id");
CREATE INDEX "base_menu_import_logs_status_idx" ON "base_menu_import_logs"("status");

ALTER TABLE "base_menu_templates"
  ADD CONSTRAINT "base_menu_templates_current_published_version_id_fkey"
  FOREIGN KEY ("current_published_version_id") REFERENCES "base_menu_template_versions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "base_menu_template_versions"
  ADD CONSTRAINT "base_menu_template_versions_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "base_menu_templates"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "base_menu_categories"
  ADD CONSTRAINT "base_menu_categories_version_id_fkey"
  FOREIGN KEY ("version_id") REFERENCES "base_menu_template_versions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "base_menu_products"
  ADD CONSTRAINT "base_menu_products_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "base_menu_categories"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "base_menu_import_logs"
  ADD CONSTRAINT "base_menu_import_logs_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "base_menu_import_logs"
  ADD CONSTRAINT "base_menu_import_logs_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "base_menu_templates"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "base_menu_import_logs"
  ADD CONSTRAINT "base_menu_import_logs_version_id_fkey"
  FOREIGN KEY ("version_id") REFERENCES "base_menu_template_versions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
