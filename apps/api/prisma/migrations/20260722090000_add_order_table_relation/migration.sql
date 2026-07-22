-- Additive relation: table_number remains the immutable human-readable snapshot.
ALTER TABLE "orders" ADD COLUMN "table_id" TEXT;

CREATE INDEX "orders_tenant_id_table_id_idx" ON "orders"("tenant_id", "table_id");

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_table_id_fkey"
  FOREIGN KEY ("table_id") REFERENCES "dine_in_tables"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill only unambiguous, tenant-scoped normalized names.  The WHERE clause
-- makes the data operation safe to repeat if it is ever run manually.
WITH normalized_tables AS (
  SELECT
    id,
    tenant_id,
    regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g') AS normalized_name,
    count(*) OVER (
      PARTITION BY tenant_id, regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')
    ) AS match_count
  FROM "dine_in_tables"
)
UPDATE "orders" AS "order"
SET "table_id" = "table".id
FROM normalized_tables AS "table"
WHERE "order".table_id IS NULL
  AND "order".table_number IS NOT NULL
  AND "order".tenant_id = "table".tenant_id
  AND regexp_replace(btrim("order".table_number), '[[:space:]]+', ' ', 'g') = "table".normalized_name
  AND "table".match_count = 1;
