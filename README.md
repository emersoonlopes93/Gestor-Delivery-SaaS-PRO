# Gestor Delivery SaaS PRO

> **Sistema SaaS de gestão de delivery multi-tenant** — plataforma completa para restaurantes, dark kitchens e redes de alimentação.

---

## O que é este projeto?

Monorepo TypeScript com backend NestJS e múltiplos frontends React que compõem uma plataforma SaaS white-label de gestão de delivery, com suporte a:

- Cardápio digital e storefront público
- Gestão de pedidos em tempo real
- Entrega própria com rastreamento
- PDV e operação presencial
- CRM, campanhas e fidelidade
- Integração com iFood
- Atendimento automatizado via IA (WhatsApp)
- Billing e assinatura multi-plano
- Administração SaaS centralizada

---

## Aplicações

| App | Finalidade | Porta dev |
|-----|-----------|-----------|
| `apps/api` | Backend NestJS (API REST + WebSocket) | 3333 |
| `apps/web-tenant` | Painel da loja (owner/staff) | 5173 |
| `apps/web-admin` | Admin SaaS central | 5174 |
| `apps/web-storefront` | Cardápio público do cliente | 3000 |
| `apps/web-delivery` | App do entregador | — |

---

## Stack principal

- **Runtime:** Node.js ≥ 22
- **Package manager:** pnpm ≥ 9
- **Monorepo:** Turborepo
- **Backend:** NestJS 10 + Express
- **ORM:** Prisma 5 + PostgreSQL
- **Cache/Filas:** Redis + BullMQ
- **Realtime:** Socket.IO (WebSockets)
- **Frontend:** Vite + React + Tailwind CSS (web-tenant)
- **Tipos compartilhados:** TypeScript strict

---

## Documentação

| Destino | Conteúdo |
|---------|----------|
| [`AGENTS.md`](./AGENTS.md) | **Protocolo para agentes de desenvolvimento** — leia antes de qualquer alteração |
| [`docs/README.md`](./docs/README.md) | Índice completo da documentação |
| [`docs/getting-started/local-development.md`](./docs/getting-started/local-development.md) | Como rodar localmente |
| [`docs/architecture/overview.md`](./docs/architecture/overview.md) | Visão arquitetural do sistema |
| [`docs/contracts/`](./docs/contracts/) | Contratos críticos (autenticação, pedidos, features, etc.) |
| [`docs/product/feature-matrix.md`](./docs/product/feature-matrix.md) | Matriz real de funcionalidades com status verificado |
| [`docs/product/known-gaps.md`](./docs/product/known-gaps.md) | Gaps e limitações conhecidas |
| [`docs/audits/`](./docs/audits/) | Inventário e auditoria documental |

---

## Comandos rápidos

```bash
# Instalar dependências
pnpm install

# Desenvolvimento (todos os apps)
pnpm dev:all

# Apenas a API
pnpm dev:api

# Migrations
pnpm db:migrate

# Seed
pnpm db:seed

# Build completo
pnpm build

# Lint + typecheck
pnpm lint
pnpm typecheck

# Smoke tests
pnpm smoke:p1
```

> **Ver documentação completa de comandos:** [`docs/getting-started/local-development.md`](./docs/getting-started/local-development.md)

---

## Arquitetura resumida

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontends (Vite/React)                  │
│  web-tenant  │  web-admin  │  web-storefront  │ web-delivery│
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / WebSocket
┌──────────────────────────────▼──────────────────────────────┐
│                    API (NestJS / Express)                    │
│           REST + WebSocket + Background Jobs                 │
├────────────┬─────────────┬──────────────────────────────────┤
│  PostgreSQL │    Redis    │  Cloudflare R2 / Local Storage   │
│  (Prisma)   │  (BullMQ)  │  (uploads e mídia)               │
└────────────┴─────────────┴──────────────────────────────────┘
```

---

## Estado do projeto

> Para o estado atual detalhado, consulte [`docs/handoffs/current-state.md`](./docs/handoffs/current-state.md).

**Branch:** `main-copy`  
**Última verificação:** 2026-07-15  

O sistema está em **produção beta** com tenants reais. A maioria dos módulos core está estável. Funcionalidades avançadas como IA, campanhas, WhatsApp e iFood estão em beta.
