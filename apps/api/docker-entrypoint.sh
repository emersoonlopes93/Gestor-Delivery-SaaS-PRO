#!/bin/sh
set -e

echo "Aguardando banco de dados..."
# Opcional: Adicionar check de conectividade com pg_isready se necessário

echo "Rodando Prisma Migrate Deploy..."
npx prisma migrate deploy

echo "Iniciando a API..."
exec node dist/apps/api/src/main.js
