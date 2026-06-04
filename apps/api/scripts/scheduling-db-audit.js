const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  try {
    const tableNames = await prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`;
    console.log('public tables:', JSON.stringify(tableNames, null, 2));
    const migrations = await prisma.$queryRaw`SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 50`;
    console.log('migrations:', JSON.stringify(migrations, null, 2));
    const tables = ['time_slots', 'scheduled_orders', 'orders', 'scheduling_settings', 'scheduling_windows'];
    for (const table of tables) {
      const cols = await prisma.$queryRawUnsafe(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name = $1 ORDER BY ordinal_position`, table);
      console.log(`=== ${table} ===`);
      console.log(JSON.stringify(cols, null, 2));
    }
    const orderColumns = await prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name IN ('scheduled_for','is_scheduled') ORDER BY column_name`;
    console.log('order scheduled columns:', JSON.stringify(orderColumns, null, 2));
  } catch (error) {
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
