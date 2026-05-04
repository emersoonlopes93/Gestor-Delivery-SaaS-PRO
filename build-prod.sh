#!/bin/bash

# Script para build das imagens do Gestor Delivery SaaS PRO
# Use este script na sua VPS antes de fazer o deploy no Portainer

echo "🚀  Iniciando build das imagens de produção..."

# Build API
echo "📦 Building API..."
docker build -t gestor-api:latest -f apps/api/Dockerfile .

# Build Web Admin
echo "📦 Building Web Admin..."
docker build -t gestor-admin:latest -f Dockerfile.frontend --build-arg APP_NAME="@gestor/web-admin" .

# Build Web Tenant
echo "📦 Building Web Tenant..."
docker build -t gestor-tenant:latest -f Dockerfile.frontend --build-arg APP_NAME="@gestor/web-tenant" .

# Build Web Storefront
echo "📦 Building Web Storefront..."
docker build -t gestor-storefront:latest -f Dockerfile.frontend --build-arg APP_NAME="@gestor/web-storefront" .

echo "✅ Build finalizado com sucesso!"
echo "Agora você pode atualizar o stack no Portainer."
