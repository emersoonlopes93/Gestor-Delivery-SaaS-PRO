---
title: Desenvolvimento Local
status: current
owner: engineering
last_verified: 2026-07-15
verified_against: main-copy / c63d394
source_of_truth:
  - package.json
  - apps/api/package.json
  - .env.example
  - apps/api/prisma/schema.prisma
  - .github/workflows/ci.yml
---

# Desenvolvimento Local

---

## Pré-requisitos

| Ferramenta | Versão mínima | Como instalar |
|-----------|---------------|---------------|
| Node.js | ≥ 22.0.0 | [nodejs.org](https://nodejs.org) |
| pnpm | ≥ 9.0.0 | `npm install -g pnpm@9` |
| PostgreSQL | ≥ 14 | [postgresql.org](https://www.postgresql.org/download/) |
| Redis | ≥ 7 | [redis.io](https://redis.io/download/) (opcional para dev básico) |

> Redis é opcional em desenvolvimento. Sem Redis, cache usa in-memory e filas BullMQ ficam indisponíveis (campanhas, automações desabilitadas).

---

## 1. Clonar e instalar

```bash
git clone <repo-url>
cd Gestor-Delivery-SaaS-PRO

# Instalar todas as dependências do monorepo
pnpm install
```

---

## 2. Configurar variáveis de ambiente

```bash
# Copiar exemplo para o arquivo de ambiente da API
cp .env.example apps/api/.env

# (Opcional) copiar para o workspace raiz se necessário
cp .env.example .env
```

Edite `apps/api/.env` com os valores corretos para seu ambiente. Consulte a [referência completa de variáveis](./environment-variables.md).

**Mínimo necessário para rodar localmente:**

```env
NODE_ENV=development
API_PORT=3333
API_PREFIX=/api/v1
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/gestor_delivery?schema=public"
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/gestor_delivery?schema=public"
JWT_SECRET=local-dev-secret-min-16-chars
JWT_REFRESH_SECRET=local-dev-refresh-secret-min-16-chars
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
CORS_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:3000
```

---

## 3. Banco de dados

```bash
# Criar banco (se não existir) e rodar todas as migrations
pnpm db:migrate

# Gerar o Prisma Client (obrigatório antes do primeiro build)
pnpm db:generate

# Popular o banco com dados de seed de desenvolvimento
pnpm db:seed
```

> **Atenção:** `pnpm db:migrate` executa `prisma migrate dev` — use apenas em desenvolvimento. Em produção/CI, o CI usa `prisma migrate deploy` via `pnpm --filter @gestor/api prisma:migrate:deploy`.

---

## 4. Iniciar o desenvolvimento

### Opção A: Todos os apps em paralelo
```bash
pnpm dev:all
```

### Opção B: Cada app individualmente
```bash
# Terminal 1 — API
pnpm dev:api

# Terminal 2 — Painel da loja
pnpm dev:web-tenant

# Terminal 3 — Admin SaaS
pnpm dev:web-admin

# Terminal 4 — Storefront público
pnpm dev:web-storefront
```

### URLs padrão de desenvolvimento
| App | URL |
|-----|-----|
| API | http://localhost:3333/api/v1 |
| Health check | http://localhost:3333/api/v1/health |
| Web Tenant | http://localhost:5173 |
| Web Admin | http://localhost:5174 |
| Web Storefront | http://localhost:3000 |

---

## 5. Verificar qualidade do código

```bash
# Lint (ESLint)
pnpm lint

# Verificação de tipos (TypeScript)
pnpm typecheck

# Verificar ausência de `any` (obrigatório na CI)
pnpm check:no-any

# Verificar fronteiras de pacotes
pnpm check:boundaries

# Verificação crítica de classes de tema hardcoded
pnpm check:theme
```

---

## 6. Executar smoke tests

```bash
# Smoke test P1 (requer API rodando)
pnpm smoke:p1

# Suite completa
pnpm --filter @gestor/api smoke:all
```

> Smoke tests requerem a API em execução e banco com seed. Configure `SMOKE_API_BASE_URL`, `SMOKE_TENANT_SLUG`, `SMOKE_TENANT_EMAIL` e `SMOKE_TENANT_PASSWORD` antes de executar.

---

## 7. Prisma Studio (visualizar dados)

```bash
pnpm db:studio
```

Abre interface web em http://localhost:5555 para inspecionar o banco.

---

## 8. Build de produção

```bash
# Build completo (apenas para validação local — use CI para deploy real)
pnpm build

# Build da API apenas
pnpm build:api
```

---

## Portas usadas

| Serviço | Porta padrão |
|---------|-------------|
| API NestJS | 3333 |
| Web Tenant (Vite) | 5173 |
| Web Admin (Vite) | 5174 |
| Web Storefront (Vite) | 3000 |
| Prisma Studio | 5555 |
| PostgreSQL | 5432 |
| Redis | 6379 |
