import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { seedBaseMenuTemplates } from '../src/catalog/menu-import/base-menu-bootstrap';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding base menu templates from bootstrap data...');

  const summary = await seedBaseMenuTemplates(prisma);

  console.log(
    `Base menu templates seeded: ${summary.templates} templates, ${summary.versions} versions, ${summary.categories} categories, ${summary.products} products.`,
  );
}

main()
  .catch((error) => {
    console.error('Base menu template seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
