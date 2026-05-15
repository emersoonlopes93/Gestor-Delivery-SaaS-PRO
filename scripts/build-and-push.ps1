# Script para gerar e subir imagens para o Docker Hub
# Uso: .\scripts\build-and-push.ps1 -User seu-usuario-docker

param (
    [Parameter(Mandatory=$true)]
    [string]$User
)

$VITE_API_URL = "https://api.seudominio.com/api/v1" # Altere para sua URL de produção

Write-Host "🚀 Iniciando Build das imagens para o usuário: $User" -ForegroundColor Cyan

# Define a variável de ambiente para o docker-compose
$env:DOCKER_USER = $User
$env:VITE_API_URL = $VITE_API_URL

# Build das imagens
docker compose -f docker-compose.build.yml build

if ($LASTEXITCODE -ne 0) {
    Write-Error "❌ Erro ao buildar as imagens."
    exit $LASTEXITCODE
}

Write-Host "✅ Build concluído! Iniciando Push para o Docker Hub..." -ForegroundColor Green

# Push das imagens
docker compose -f docker-compose.build.yml push

if ($LASTEXITCODE -ne 0) {
    Write-Error "❌ Erro ao fazer push das imagens. Certifique-se de estar logado (docker login)."
    exit $LASTEXITCODE
}

Write-Host "🎉 Todas as imagens foram enviadas com sucesso!" -ForegroundColor Cyan
