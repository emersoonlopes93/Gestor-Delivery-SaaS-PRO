const { PrismaClient } = require('@prisma/client');

async function main() {
  if (process.env.CLEAN_DB !== 'true') {
    console.log('CLEAN_DB is not set to "true". Skipping database clean.');
    return;
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

main();
