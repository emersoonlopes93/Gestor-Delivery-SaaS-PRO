import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { seedBaseMenuTemplates } from '../src/catalog/menu-import/base-menu-bootstrap';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding base menu templates from bootstrap data...');

  const summary = await seedBaseMenuTemplates(prisma);

  for (const message of summary.messages) {
    console.log(message);
  }
  for (const warning of summary.warnings) {
    console.warn(warning);
  }

  console.log(
    [
      `Base menu bootstrap complete:`,
      `${summary.templatesCreated} templates criados`,
      `${summary.templatesPreserved} templates preservados`,
      `${summary.versionsCreated} versoes criadas`,
      `${summary.versionsOverwritten} versoes sobrescritas`,
      `${summary.productsOverwritten} produtos sobrescritos`,
      `${summary.categories} categorias criadas`,
      `${summary.products} produtos criados`,
    ].join(' | '),
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
