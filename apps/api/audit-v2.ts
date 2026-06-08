import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function countTable(tableName: string) {
  try {
    const t = await prisma.$queryRawUnsafe(`SELECT COUNT(*) FROM "${tableName}"`);
    console.log(`${tableName}:`, Number(t[0].count));
  } catch (e: unknown) {
    console.log(`${tableName}: 0 (Table does not exist)`);
  }
}

async function main() {
  await countTable('ProductComplementGroup');
  await countTable('ProductComplementGroupLink');
  await countTable('ProductComplementItem');
  await countTable('ProductCombo');
  await countTable('ProductComboBlock');
  await countTable('ProductComboBlockItem');
  await countTable('OrderItemComplement');
  await countTable('OrderItemComboSelection');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
