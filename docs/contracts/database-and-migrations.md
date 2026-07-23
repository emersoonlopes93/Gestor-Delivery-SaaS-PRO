# Contrato — Banco de Dados e Migrations

> **Status:** Estável  
> **Última revisão:** 2026-07-23  
> **Verificado contra:** `main-copy / 78daea7a`  
> **Total de migrations:** 48

---

## 1. Tecnologias

| Componente | Versão / Detalhes |
|------------|------------------|
| ORM | Prisma 5 |
| Banco | PostgreSQL 16 |
| Schema | `apps/api/prisma/schema.prisma` (176 KB) |
| Migrations | `apps/api/prisma/migrations/` |
| Client gerado | `@prisma/client` |

---

## 2. Regras inegociáveis

- **Nunca** usar `prisma db push` em produção — somente `prisma migrate deploy`.
- **Nunca** modificar schema sem criar migration correspondente.
- **Nunca** fazer alterações destrutivas diretas em produção sem estratégia de rollout em etapas.
- **Nunca** executar migration remota sem confirmar `DATABASE_URL` e `DIRECT_URL` apontam para o alvo correto.
- Migrations devem ser **aditivas** — adicionar colunas/tabelas nullable antes de remover antigas.

---

## 3. Variáveis de ambiente do banco

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `DATABASE_URL` | Sim | URL de conexão para o Prisma Client (leitura/escrita) |
| `DIRECT_URL` | Sim | URL direta para migrations (bypass de pooler como PgBouncer) |

> ⚠️ **Incidente registrado:** Em 2026-07-16, durante validação local, a `DIRECT_URL` não foi sobrescrita e as migrations 5A-5C foram aplicadas em banco remoto não identificado. Antes de qualquer staging/produção, auditar `_prisma_migrations` nesse banco.

---

## 4. Comandos verificados

```bash
# Desenvolvimento
pnpm db:generate          # gera Prisma Client após alterar schema
pnpm db:migrate           # prisma migrate dev (cria migration + aplica)
pnpm db:seed              # seed do banco de desenvolvimento
pnpm db:studio            # abre Prisma Studio

# Validação (sempre antes de PR)
pnpm prisma:validate      # valida integridade do schema

# Produção (via serviço isolado no Docker Compose)
npx prisma@5.22.0 migrate deploy
```

---

## 5. Fluxo obrigatório para criar uma migration

1. Alterar `apps/api/prisma/schema.prisma`
2. Executar `pnpm db:migrate` (nome descritivo em snake_case)
3. Verificar o SQL gerado em `apps/api/prisma/migrations/<timestamp>_<nome>/migration.sql`
4. Validar `pnpm prisma:validate` e `pnpm typecheck`
5. Testar em PostgreSQL 16 efêmero (banco vazio + upgrade a partir de estado anterior)
6. Calcular checksum SHA-256 do arquivo migration.sql e registrar no handoff

---

## 6. Estratégia de rollout em produção

```
1. Deploy do código com suporte dual (novo + legado)
2. Executar service `api-migrate` (profile: operations) isoladamente
3. Validar startup da API sem erros P2022/P2003
4. Monitorar por 24h antes de remover suporte ao legado
5. Migration destrutiva (DROP) apenas em sprint separada e aprovada
```

---

## 7. Multi-tenancy no banco

- Todo model operacional possui `tenantId` como campo obrigatório com índice.
- Models globais (sem `tenantId`): `AdminUser`, `FeatureGlobalSetting`, `SystemConfig`, `BillingPlan`, `BaseMenu`, `BaseMediaAsset`.
- Constraints de unicidade operam **dentro do escopo do tenant** (ex: `@@unique([tenantId, slug])`).

---

## 8. Convenções de nomenclatura

| Elemento | Prisma (camelCase) | PostgreSQL (snake_case) |
|----------|-------------------|------------------------|
| Model | `Order` | `orders` |
| Campo | `tenantId` | `tenant_id` |
| Relação | `tenant Tenant` | FK `tenant_id` |
| Index | `@@index([tenantId])` | `orders_tenant_id_idx` |

Mapeamento explícito via `@map` e `@@map` em todos os models.

---

## 9. Migrations de referência

| Migration | Data | Conteúdo |
|-----------|------|---------|
| `20260531185153_billing_foundation` | 2026-05-31 | Billing e assinaturas |
| `20260609090000_phase9_campaign_automation_metrics` | 2026-06-09 | Campanhas e automações |
| `20260618065552_marketplace_ifood_p1` | 2026-06-18 | iFood pedidos P1 |
| `20260715234118_create_push_subscriptions` | 2026-07-15 | Push Notifications |
| `20260716050000_marketplace_bidirectional_operations` | 2026-07-16 | iFood Sprint 5A |
| `20260716150000_marketplace_reconciliation_operations` | 2026-07-16 | iFood Sprint 5B |
| `20260716190000_ifood_polling_fallback` | 2026-07-16 | iFood Sprint 5C polling |
| `20260716210000_add_system_config_platform_logo_media` | 2026-07-16 | Branding logo |
| `20260722090000_add_order_table_relation` | 2026-07-22 | Pedido–Mesa |
| `20260722120000_campaign_status_and_opt_out_compatibility` | 2026-07-22 | Status campanha |

---

## 10. Referências

- Schema: `apps/api/prisma/schema.prisma`
- Migrations: `apps/api/prisma/migrations/`
- Entrypoint Docker: `apps/api/docker-entrypoint.sh`
- Compose de produção: `docker-compose.prod.yml` (service `api-migrate`)
- Runbook Dokploy: `docs/operations/runbooks/dokploy-deployment.md`
