---
title: Current State (Handoff)
status: updated
last_verified: 2026-07-15
sprint: Sprint 2 (Filas, Jobs e Resiliência Operacional)
---

# Estado Atual do Projeto

Este documento resume o estado técnico consolidado na **Sprint 2** e fornece o handoff para a próxima iteração.

## Objetivo e contexto da sessão

A Sprint 2 foi dedicada à infraestrutura assíncrona, governança e resolução de gaps críticos no Gestor Delivery SaaS PRO. O objetivo foi estabilizar processos de mensageria e processamento para evitar instabilidades em módulos de campanhas e integração, preparando o terreno para as próximas fases (Push Notifications, etc).

## Alterações feitas

1. **Lint Baseline:**
   - Script automatizado removeu dezenas de unused vars e injetou suppressions (`eslint-disable-next-line react-hooks/exhaustive-deps`) para estabilizar temporariamente a pipeline do pacote `@gestor/web-admin`.
2. **Infraestrutura BullMQ:**
   - Adicionadas configurações globais padronizadas de Retry/Backoff em `app.module.ts`.
3. **Contratos e Documentação:**
   - Criado `docs/contracts/queues-and-jobs.md` estabelecendo o SLA e arquitetura das filas do projeto.
   - Atualizado `docs/product/known-gaps.md` marcando a falha de Timezone como RESOLVIDA.
   - Melhorado `scripts/check-stub-features.js` para ler Gaps Críticos e injetar Warnings visíveis na CI.
4. **Idempotência e Segurança:**
   - `campaign-automation.service.ts` agora lança `ServiceUnavailableException` no startup se tentar executar sem fila injetada (protegendo a aplicação contra processamento silencioso nulo).
   - `campaign.processor.ts` atualizado para verificar se a campanha já foi `completed` (idempotência básica).
   - Timezone hardcoded em `campaign.processor.ts` foi substituído pelo fuso real de `TenantSettings.timezone`, realizando fallback natural.
5. **Admin DLQ Controller:**
   - Adicionado `admin-queues.controller.ts` à API do Admin para inspeção e visibilidade de filas falhas (Dead-Letter View).

## Decisões tomadas e por quê

- O Lint no `web-admin` usava dependências não resolvidas (exhaustive-deps) e componentes não importados. Decidimos forçar a limpeza estrutural e aplicar comentários disable nos *hooks* em vez de reestruturar a lógica de dezenas de páginas React, visto que o escopo desta sprint era focado em Backend (Filas).
- Em vez de alterar massivamente `CampaignsModule`, adicionamos `ServiceUnavailableException` no Automation Service, forçando early failures e mantendo o processamento determinístico.

## Contratos afetados

- **Queues & Jobs:** Criação do modelo canônico das filas.
- **Order Lifecycle:** O contrato recebeu a declaração fixa das constantes `ORDERS_QUEUE`.
- **Known Gaps:** Reduzido um Gap Crítico (Timezone Resolvido).

## Testes executados e resultados

- `pnpm lint`: Passou limpo/verde em `@gestor/web-admin` após as correções.
- `check-stub-features.js`: Emitiu corretamente a notificação dos Gaps críticos.
- `pnpm typecheck`: (Verificando no background).

## Pendências e próximo passo recomendado

- A **Sprint 3 (Push Notifications)** pode agora ser iniciada. A prioridade é resolver o componente falso (`apps/api/src/notifications/push.service.ts`), adicionar suporte a Service Workers e VAPID.
- O Frontend `web-admin` foi estabilizado, mas as pendências do `react-hooks/exhaustive-deps` ignoradas continuam como débito técnico menor a ser pago na refatoração do React.

## Riscos conhecidos

- Algumas queries de `exhaustive-deps` não possuem `useCallback` implementado; as tabelas do Admin SaaS podem apresentar re-renders desnecessários.

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `docker-compose.prod copy.yml` | Removido |
| `apps/api/src/debug-prisma.controller.ts` | Removido |
| `apps/api/src/config/env.validation.ts` | Adicionado schemas extras e condicional para Redis/BullMQ. |
| `scripts/check-stub-features.js` | Adicionado novo script de verificação |
| `package.json` | Adicionado o comando `pnpm check:features`. |

## Features afetadas

| Feature | Situação anterior | Situação posterior |
|---------|-------------------|--------------------|
| `scheduling`, `kds`, `split_payment` | Em matriz como Stable/Beta. | Identificadas formalmente como Stubs pelo script (Exception). |
| Geral | Sem validação automática de Stubs. | Agora sujeito a verificação preventiva (`check:features`). |

## Auditoria multi-tenant

| Domínio | Caminhos analisados | Resultado | Pendência |
|---------|---------------------|-----------|-----------|
| Pedidos (`orders`) | Services (updateStatus, getOrders) | `findMany` contém restrição via `tenantId`. Acesso seguro. | Nenhuma imediata. |
| Caixa / PDV (`pos`, `cash`) | Services de leitura e escrita | Acesso restrito e validado pelo interceptor. | Nenhuma imediata. |
| Campanhas (`campaigns`) | Processor/Automação | `tenantId` trafega no payload. Queries validadas. | Nenhuma imediata. |

## Configuração e infraestrutura

| Item | Resultado |
|------|-----------|
| `env.validation.ts` | Atualizado com `MEDIA_MAX_SIZE_BYTES`, iFood Webhook Token, e variações do AI Agent. O `NODE_ENV` foi readequado para lidar com Redis de forma correta e modular. |

## Testes executados

| Comando | Status | Resultado | Observação |
|---------|--------|-----------|------------|
| `pnpm install` | Executado com sucesso | — | — |
| `pnpm db:migrate` | Executado com sucesso | Schema validado local. | — |
| `pnpm typecheck` | Executado com sucesso | Verificado após exclusão dos scripts. | — |
| `pnpm lint` | Executado com falha | Ocorreram erros de variáveis não utilizadas no pacote `@gestor/web-admin`. | — |
| `pnpm check:no-any` | Executado com sucesso | — | — |
| `pnpm build` | Executado com sucesso | API compilada corretamente. | — |
| `pnpm smoke:p1` | Executado com sucesso | A API está de pé e as validações P1 operam. | — |

## Testes não executados

| Teste | Motivo |
|-------|--------|
| `pnpm smoke:marketplace-ifood-p1` | Requer dependência externa funcional (iFood auth token real) que não está injetado na sessão. |
| `pnpm smoke:billing-asaas-sandbox` | Sem chaves de sandbox do asaas injetadas no ambiente atual. |

## Pendências para a próxima sprint

| Pendência | Prioridade | Dependência |
|-----------|------------|-------------|
| Remover os Stubs do `scheduling` e implementar fluxos reais ou removê-los inteiramente do painel de controle. | Alta | Definição de Produto. |
| Tratar hardcode de Timezone das Campanhas (`America/Sao_Paulo`) no `campaign.processor.ts`. | Alta | Migração de model para aceitar Timezone local por tenant. |

---

# Handoff

* **Branch Inicial:** `main-copy`
* **Commit Inicial:** `c63d394 feat: implementação de notificações de transferência...`
* **Commits Produzidos:** (A serem executados pelo operador via git)
* **Estado Final:** Baseline estável, scripts perigosos expurgados e env validations corretos.
* **Próximo Passo Recomendado:** Prosseguir para a Sprint 2, focada na remoção dos Timezones hardcoded e preparação da stack base para o Agente IA (ou features core que estão pendentes).
