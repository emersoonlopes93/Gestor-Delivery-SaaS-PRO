---
title: Current State (Handoff)
status: updated
last_verified: 2026-07-15
sprint: Sprint 1 (Governança, Segurança e Baseline de Produção)
---

# Estado Atual do Projeto

Este documento resume o estado técnico consolidado na **Sprint 1** e fornece o handoff para a próxima iteração.

## Resumo executivo

O baseline seguro foi estabelecido. Scripts destrutivos e órfãos foram removidos (`drop_models.js`, `debug-prisma.controller.ts`, etc). A infraestrutura via `env.validation.ts` teve suas validações ajustadas para acomodar instâncias sem dependências assíncronas forçadas (`REDIS` e `BULLMQ` condicionais ao uso em produção).
Novas regras automáticas (como a deteção de `NotImplementedException`) foram introduzidas, impedindo que "stubs" cheguem a ambientes operacionais. O isolamento de Tenant se provou implementado adequadamente usando o filtro explícito de `tenantId`.

## Riscos corrigidos

| Risco | Severidade | Correção |
|-------|------------|----------|
| Corrupção de schema (`drop_models.js`) | Crítica | Script físico deletado do repositório. O histórico fica no git. |
| Exposição de dados (`debug-prisma.controller.ts`) | Alta | Controller removido pois estava órfão e com marcação `@Public()`. |
| Conflito de Docker Compose | Baixa | `docker-compose.prod copy.yml` removido. |
| Dependência inflexível de Redis/BullMQ | Média | Relaxada a obrigatoriedade estrita em produção; adicionada validação cruzada apenas caso features de background sejam habilitadas (`CAMPAIGNS_DISPATCH_ENABLED`). |

## Arquivos alterados

| Arquivo | Alteração |
|---------|-----------|
| `drop_models.js` | Removido |
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
