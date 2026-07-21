# Documentação — Gestor Delivery SaaS PRO

> Índice completo da documentação técnica e funcional do projeto.
> Para o protocolo de agentes, consulte [`AGENTS.md`](../AGENTS.md) na raiz.

---

## Início rápido

| Documento | Descrição |
|-----------|-----------|
| [Pré-requisitos](./getting-started/prerequisites.md) | Node, pnpm, PostgreSQL, Redis |
| [Desenvolvimento local](./getting-started/local-development.md) | Como rodar o projeto localmente |
| [Variáveis de ambiente](./getting-started/environment-variables.md) | Referência completa de variáveis |
| [Banco de dados](./getting-started/database.md) | Setup e comandos do Prisma |
| [Troubleshooting](./getting-started/troubleshooting.md) | Problemas comuns e soluções |

---

## Arquitetura

| Documento | Descrição |
|-----------|-----------|
| [Visão geral](./architecture/overview.md) | Diagrama e descrição do sistema |
| [Estrutura do repositório](./architecture/repository-structure.md) | Mapa de apps e packages |
| [Backend](./architecture/backend.md) | NestJS, módulos, interceptors, guards |
| [Frontends](./architecture/frontends.md) | Aplicações React e seus públicos |
| [Multi-tenancy](./architecture/multi-tenancy.md) | Como o isolamento de tenant funciona |
| [Modelo de dados](./architecture/data-model.md) | Schema Prisma e relações principais |
| [Filas e cache](./architecture/queues-and-cache.md) | Redis, BullMQ, configurações |
| [Integrações](./architecture/integrations.md) | Mercado Pago, iFood, WhatsApp, IA, Storage |

---

## Contratos técnicos

> Contratos são invariantes que não podem ser quebrados sem deliberação explícita.

| Contrato | Descrição |
|----------|-----------|
| [API REST](./contracts/api.md) | Prefixo, versionamento, envelopes, erros |
| [Autenticação](./contracts/authentication.md) | JWT, sessões, refresh, identidades |
| [Autorização / RBAC](./contracts/authorization-rbac.md) | Permissões, papéis, guards |
| [Isolamento de tenant](./contracts/tenant-isolation.md) | Como o tenant é propagado e protegido |
| [Ciclo de vida do pedido](./contracts/order-lifecycle.md) | Máquina de estados, transições, eventos |
| [Feature Flags](./contracts/feature-flags.md) | Catálogo, precedência, presets |
| [Banco e Migrations](./contracts/database-and-migrations.md) | Quando criar, como nomear, produção |
| [Filas e Jobs](./contracts/queues-and-jobs.md) | BullMQ, producers, consumers, retry |
| [Eventos e WebSockets](./contracts/events-and-websockets.md) | Socket.IO, namespaces, payload |
| [Pagamentos](./contracts/payments.md) | Criação, confirmação, webhook, reconciliação |
| [Marketplace](./contracts/marketplace.md) | iFood, ingestão, sincronização |
| [Agendamento](./contracts/scheduling.md) | Janelas, slots, timezone, capacidade e checkout |
| [Tratamento de erros](./contracts/error-handling.md) | Envelopes, filtros, logging |

---

## Produto

| Documento | Descrição |
|-----------|-----------|
| [Matriz de features](./product/feature-matrix.md) | Status real de cada funcionalidade |
| [Gaps conhecidos](./product/known-gaps.md) | Limitações e stubs documentados |
| [Fluxos de usuário](./product/user-flows.md) | Principais jornadas dos usuários |

---

## Desenvolvimento

| Documento | Descrição |
|-----------|-----------|
| [Padrões de código](./development/coding-standards.md) | TypeScript, linting, convenções |
| [Testes](./development/testing.md) | Tipos de teste, comandos, cobertura |
| [Adicionando uma feature](./development/adding-a-feature.md) | Passo a passo completo |
| [Adicionando um endpoint](./development/adding-an-api-endpoint.md) | Controller, service, DTO, guard |
| [Alterando o banco](./development/changing-the-database.md) | Migrations, backfill, rollback |
| [Adicionando um job](./development/adding-a-job.md) | Producer, consumer, idempotência |
| [Definition of Done](./development/definition-of-done.md) | Checklist de conclusão de tarefa |

---

## Operações

| Documento | Descrição |
|-----------|-----------|
| [Deploy no Dokploy](./operations/runbooks/dokploy-deployment.md) | Compose, migration operacional e validação de produção |
| [Prontidão para produção](./operations/production-readiness.md) | Checklist de lançamento |
| [Observabilidade](./operations/observability.md) | Logs, métricas, health checks |
| [Backup e restore](./operations/backups-and-restore.md) | Estratégia de backup do banco |
| [Runbooks](./operations/runbooks/) | Procedimentos operacionais por domínio |

---

## Decisões arquiteturais (ADRs)

| ADR | Título |
|-----|--------|
| [ADR-0001](./decisions/ADR-0001-multi-tenancy-strategy.md) | Estratégia de multi-tenancy |
| [ADR-0002](./decisions/ADR-0002-feature-flags-governance.md) | Governança de feature flags |
| [ADR-0003](./decisions/ADR-0003-redis-bullmq-requirement.md) | Redis e BullMQ como dependência condicional |
| [ADR-0004](./decisions/ADR-0004-auth-sessions-db.md) | Sessões de autenticação persistidas no banco |
| [ADR-0005](./decisions/ADR-0005-pwa-strategy.md) | Estratégia PWA |

---

## Handoffs e estado atual

| Documento | Descrição |
|-----------|-----------|
| [Estado atual](./handoffs/current-state.md) | Situação do projeto agora |
| [Trabalho ativo](./handoffs/active-work.md) | O que está sendo desenvolvido |
| [Template de sessão](./handoffs/session-template.md) | Modelo para registrar uma sessão |

---

## Auditoria

| Documento | Descrição |
|-----------|-----------|
| [Inventário documental](./audits/documentation-inventory.md) | Todos os docs com estado e ação |
| [Relatório de auditoria](./audits/documentation-audit.md) | Análise de consistência código vs docs |
| [Contradições](./audits/contradictions.md) | Divergências documentadas |

---

## Arquivo histórico

Documentos arquivados estão em `docs/archive/`. Cada um contém aviso indicando o documento canônico substituto.
