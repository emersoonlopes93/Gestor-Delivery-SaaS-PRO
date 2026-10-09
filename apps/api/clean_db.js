const { PrismaClient } = require('@prisma/client');

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Database clean is forbidden when NODE_ENV=production.');
  }

  if (process.env.CLEAN_DB !== 'true') {
    throw new Error('Destructive database clean requires explicit CLEAN_DB=true.');
  }

  console.log('CLEAN_DB="true" detected. Cleaning database schema public...');
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL
      }
    }
  });

  try {
    await prisma.$executeRawUnsafe('DROP SCHEMA public CASCADE');
    await prisma.$executeRawUnsafe('CREATE SCHEMA public');
    await prisma.$executeRawUnsafe('GRANT ALL ON SCHEMA public TO public');
    console.log('Database cleaned successfully!');
  } catch (error) {
    console.error('Error cleaning database:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Database clean failed.');
  process.exit(1);
});
