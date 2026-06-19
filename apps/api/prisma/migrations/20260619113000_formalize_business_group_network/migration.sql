-- CreateEnum
CREATE TYPE "BusinessGroupTenantRole" AS ENUM ('headquarters', 'branch');

-- AlterTable
ALTER TABLE "business_groups"
ADD COLUMN "headquarters_tenant_id" TEXT;

-- AlterTable
ALTER TABLE "tenants"
ADD COLUMN "business_group_role" "BusinessGroupTenantRole";

-- Backfill existing business groups as branch by default
UPDATE "tenants"
SET "business_group_role" = 'branch'
WHERE "business_group_id" IS NOT NULL;

-- Promote the oldest tenant in each group as headquarters
WITH ranked_headquarters AS (
  SELECT DISTINCT ON ("business_group_id")
    "id",
    "business_group_id"
  FROM "tenants"
  WHERE "business_group_id" IS NOT NULL
  ORDER BY "business_group_id", "created_at" ASC
)
UPDATE "business_groups" AS bg
SET "headquarters_tenant_id" = rh."id"
FROM ranked_headquarters AS rh
WHERE bg."id" = rh."business_group_id";

UPDATE "tenants" AS t
SET "business_group_role" = 'headquarters'
FROM "business_groups" AS bg
WHERE bg."headquarters_tenant_id" = t."id";

-- CreateIndex
CREATE UNIQUE INDEX "business_groups_headquarters_tenant_id_key"
ON "business_groups"("headquarters_tenant_id");

-- AddForeignKey
ALTER TABLE "business_groups"
ADD CONSTRAINT "business_groups_headquarters_tenant_id_fkey"
FOREIGN KEY ("headquarters_tenant_id") REFERENCES "tenants"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
