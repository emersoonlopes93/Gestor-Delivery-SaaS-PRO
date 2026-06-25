#!/bin/sh
set -e

echo "Aguardando banco de dados..."
# Opcional: Adicionar check de conectividade com pg_isready se necessário

if [ "$CLEAN_DB" = "true" ]; then
  echo "CLEAN_DB=true detectado. Executando limpeza do banco de dados..."
  cat << 'EOF' > clean_db.js
const { PrismaClient } = require('@prisma/client');
async function main() {
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
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
EOF
  node clean_db.js
fi

echo "Rodando Prisma Migrate Deploy..."
npx prisma migrate deploy

echo "Iniciando a API..."
exec node dist/apps/api/src/main.js
