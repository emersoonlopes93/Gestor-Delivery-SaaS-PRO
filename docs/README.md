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
| [Notificações mobile](./notifications-mobile.md) | Lifecycle, conectividade, permissões, safe area e áudio |
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
| [Google para clientes](./contracts/customer-google-auth.md) | Google Sign-In tenant-scoped com linking por OTP |
| [Autorização / RBAC](./contracts/authorization-rbac.md) | Permissões, papéis, guards |
| [Isolamento de tenant](./contracts/tenant-isolation.md) | Como o tenant é propagado e protegido |
| [Consentimento do storefront](./contracts/storefront-consent.md) | Categorias, default deny, persistência local e isolamento por tenant |
| [Agregação diária de Analytics](./contracts/analytics-rollups.md) | Grão, fórmulas, timezone, worker, backfill e retenção |
| [Ciclo de vida do pedido](./contracts/order-lifecycle.md) | Máquina de estados, transições, eventos |
| [Feature Flags](./contracts/feature-flags.md) | Catálogo, precedência, presets |
| [Banco e Migrations](./contracts/database-and-migrations.md) | Quando criar, como nomear, produção |
| [Filas e Jobs](./contracts/queues-and-jobs.md) | BullMQ, producers, consumers, retry |
| [Eventos e WebSockets](./contracts/events-and-websockets.md) | Socket.IO, namespaces, payload |
| [Turnos e rotas de entrega](./contracts/delivery-runs.md) | Turnos, rotas multi-pedido, paradas, retornos e concorrência |
| [Pagamentos](./contracts/payments.md) | Criação, confirmação, webhook, reconciliação |
| [Lifecycle de compras](./contracts/purchasing-lifecycle.md) | Recebimento, contas a pagar, liquidação e reversões |
| [Acertos dos entregadores](./contracts/driver-settlements.md) | Turnos quitados, idempotência e histórico financeiro |
| [Ganhos dos entregadores](./contracts/driver-earnings.md) | Regras, snapshots, ledger e saldos do entregador |
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
| [Marketing Analytics do cardápio](./adr/marketing-analytics-foundation.md) | Fundação first-party, taxonomia, métricas, privacidade e evolução incremental |
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
| [Marketing, Analytics e Desempenho do Cardápio](./audits/marketing-analytics-cardapio-audit.md) | Estado atual, lacunas, riscos e plano incremental |
| [R2.5 — Vitrine inteligente](./audits/r2-5-smart-storefront-showcase-audit.md) | Auditoria de contratos, ranking, disponibilidade, cache e arquitetura mínima da vitrine |
| [R3 — Login do entregador sem slug](./audits/r3-driver-login-no-slug-audit.md) | Auditoria de identidade, ambiguidade, sessão, enumeração e WebSocket do entregador |
| [R4 — Segurança da criação de filiais](./audits/r4-branch-creation-safety-audit.md) | Modelo de identidade, causa do conflito, atomicidade, idempotência e bloqueio temporário da criação |
| [R5 — Paridade preview/storefront](./audits/r5-storefront-preview-parity-audit.md) | Fontes, renderers, availability, fulfillment, showcase e arquitetura mínima compartilhada |
| [R6 — Safe area, viewport e tema mobile](./audits/r6-mobile-safe-area-theme-audit.md) | Drawer no APK, fixed actions, viewport dinâmico, portals e consistência light/dark |
| [Inventário documental](./audits/documentation-inventory.md) | Todos os docs com estado e ação |
| [Relatório de auditoria](./audits/documentation-audit.md) | Análise de consistência código vs docs |
| [Contradições](./audits/contradictions.md) | Divergências documentadas |

---

## Arquivo histórico

Documentos arquivados estão em `docs/archive/`. Cada um contém aviso indicando o documento canônico substituto.
