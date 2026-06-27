#!/bin/sh
set -e

# Tenta carregar do .env se as variáveis de ambiente do SO vieram vazias (sobrescritas pelo Compose)
if [ -z "$DATABASE_URL" ] && [ -f ".env" ]; then
  echo "DATABASE_URL vazia no ambiente do SO. Carregando do arquivo .env..."
  export DATABASE_URL=$(grep -v '^#' .env | grep 'DATABASE_URL=' | head -n 1 | cut -d '=' -f2- | tr -d '"' | tr -d "'")
fi

if [ -z "$DIRECT_URL" ] && [ -f ".env" ]; then
  echo "DIRECT_URL vazia no ambiente do SO. Carregando do arquivo .env..."
  export DIRECT_URL=$(grep -v '^#' .env | grep 'DIRECT_URL=' | head -n 1 | cut -d '=' -f2- | tr -d '"' | tr -d "'")
fi

echo "DEBUG: DATABASE_URL no shell é '$DATABASE_URL'"
echo "DEBUG: DIRECT_URL no shell antes do fallback é '$DIRECT_URL'"

if [ -z "$DIRECT_URL" ]; then
  echo "DIRECT_URL ainda vazia. Usando DATABASE_URL como fallback."
  export DIRECT_URL="$DATABASE_URL"
  echo "DEBUG: DIRECT_URL no shell após o fallback é '$DIRECT_URL'"
fi

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
npx prisma@5.22.0 migrate deploy

echo "Iniciando a API..."
exec node dist/apps/api/src/main.js
