import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Aplicando índices CONCURRENTLY...');

  const queries = [
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "product_categories_tenant_id_is_active_deleted_at_order_idx" ON "product_categories"("tenant_id", "is_active", "deleted_at", "order");`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "products_tenant_id_type_is_active_deleted_at_order_idx" ON "products"("tenant_id", "type", "is_active", "deleted_at", "order");`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "products_category_id_is_active_deleted_at_order_idx" ON "products"("category_id", "is_active", "deleted_at", "order");`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "orders_tenant_id_status_created_at_idx" ON "orders"("tenant_id", "status", "created_at");`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "orders_tenant_id_created_at_idx" ON "orders"("tenant_id", "created_at");`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "orders_tenant_id_customer_id_created_at_idx" ON "orders"("tenant_id", "customer_id", "created_at");`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "time_slots_tenant_id_status_is_active_start_time_idx" ON "time_slots"("tenant_id", "status", "is_active", "start_time");`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "scheduled_orders_tenant_id_time_slot_id_status_scheduled__idx" ON "scheduled_orders"("tenant_id", "time_slot_id", "status", "scheduled_for");`,
    `CREATE INDEX CONCURRENTLY IF NOT EXISTS "scheduled_orders_tenant_id_customer_id_status_idx" ON "scheduled_orders"("tenant_id", "customer_id", "status");`
  ];

  for (const query of queries) {
    try {
      console.log(`Executing: ${query}`);
      await prisma.$executeRawUnsafe(query);
      console.log('Success!');
    } catch (e) {
      console.error(`Failed to execute query:`, e);
    }
  }

  console.log('All indices processed.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
