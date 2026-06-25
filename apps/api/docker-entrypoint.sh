#!/bin/sh
set -e

echo "Aguardando banco de dados..."
# Opcional: Adicionar check de conectividade com pg_isready se necessário

if [ "$CLEAN_DB" = "true" ]; then
  echo "CLEAN_DB=true detectado. Executando limpeza do banco de dados..."
  node apps/api/clean_db.js
fi

echo "Rodando Prisma Migrate Deploy..."
npx prisma migrate deploy

echo "Iniciando a API..."
exec node dist/apps/api/src/main.js
