---
title: Registro de Contradições
status: current
owner: engineering
last_verified: 2026-07-15
verified_against: main-copy / c63d394
---

# Registro de Contradições — Gestor Delivery SaaS PRO

> Contradições identificadas entre documentação e código-fonte. Cada item inclui evidência, risco e recomendação.

---

## C-001 — Push Notifications descritas como funcionais em TESTING-NOTIFICATIONS.md

- **Documento:** `TESTING-NOTIFICATIONS.md` (raiz)
- **Afirmação atual:** Descreve processo de testar notificações push como se fossem enviadas de fato.
- **Código correspondente:** `apps/api/src/notifications/push.service.ts`
- **Comportamento verificado:** O método `subscribe()` faz apenas log e contém TODO explícito:
  ```
  // TODO: Criar model PushSubscription no Prisma quando quiser persistir.
  ```
  O método `sendNotification()` faz log mas **não** usa o pacote `web-push`. Nenhum modelo `PushSubscription` existe no schema Prisma.
- **Risco:** Alto — operadores podem acreditar que push está funcional e tentar usar em produção.
- **Decisão documental:** Classificar push como `Stub` na matriz de features. Adicionar aviso ao documento.
- **Correção técnica recomendada:** Instalar `web-push`, criar model `PushSubscription` no Prisma, implementar `sendNotification` real.
- **Responsável:** Não atribuído
- **Status:** Aberto

---

## C-002 — `VITE_FEATURE_*` no `.env.example` com valores `true` para features beta

- **Documento:** `.env.example` (raiz), linhas 207-218
- **Afirmação atual:** Todas as features marcadas como `true` incluindo `VITE_FEATURE_AI_AGENT`, `VITE_FEATURE_FRANCHISE`, `VITE_FEATURE_BI_ADVANCED`, etc.
- **Código correspondente:** `packages/core/src/constants/features.ts`
- **Comportamento verificado:** As features `franchise`, `bi_advanced`, `ai_agent`, `campaigns`, `whatsapp_advanced`, `delivery_live_map` etc. possuem `status: 'beta'` no catálogo oficial. O `.env.example` as habilita todas por padrão, expondo funcionalidades beta para novos tenants.
- **Risco:** Médio — novos desenvolvedores podem ativar features beta inadvertidamente.
- **Decisão documental:** Documentar que o `.env.example` reflete configuração máxima de desenvolvimento, não preset de produção.
- **Correção técnica recomendada:** Adicionar comentário explicativo no `.env.example` diferenciando dev/prod, e criar `.env.production.example` com defaults conservadores.
- **Responsável:** Não atribuído
- **Status:** Aberto

---

## C-003 — Swagger desabilitado por padrão mas título refere "PedeHub API"

- **Documento:** `.env.example`, `apps/api/src/main.ts`
- **Afirmação atual:** `SWAGGER_ENABLED=false` no .env.example. Projeto se chama "Gestor Delivery SaaS PRO".
- **Código correspondente:** `apps/api/src/main.ts` linha 78:
  ```typescript
  .setTitle('PedeHub API')
  ```
- **Comportamento verificado:** O título do Swagger aponta para "PedeHub API" — nome diferente do produto atual. Indica que o projeto pode ter sido renomeado ou que é white-label.
- **Risco:** Baixo — potencial confusão de identidade do produto.
- **Decisão documental:** Documentar que o produto é white-label ou que foi renomeado.
- **Correção técnica recomendada:** Atualizar `setTitle()` ou parametrizar via variável de ambiente.
- **Responsável:** Não atribuído
- **Status:** Aberto

---

## C-004 — `delivery_neighborhood` com status `coming_soon` no catálogo

- **Documento:** `packages/core/src/constants/features.ts`
- **Afirmação atual:** Feature `delivery_neighborhood` marcada como `status: 'coming_soon'`.
- **Código correspondente:** Módulo `apps/api/src/delivery/` existe e tem implementação de zonas.
- **Comportamento verificado:** A feature está `coming_soon` no catálogo mas há código no módulo de delivery. Requer validação se existe implementação real de bairros ou apenas de raio/zonas.
- **Risco:** Médio — feature pode ser apresentada na UI como indisponível quando há código parcial.
- **Decisão documental:** Classificar como `Partial` na matriz de features até validação.
- **Correção técnica recomendada:** Validar controller e service de delivery_neighborhood.
- **Responsável:** Não atribuído
- **Status:** Requer validação

---

## C-005 — Timezone hardcoded em campaign.processor.ts

- **Documento:** Nenhum documento descreve comportamento de timezone.
- **Afirmação atual:** Não documentado.
- **Código correspondente:** `apps/api/src/campaigns/services/campaign.processor.ts` linhas 258-262:
  ```typescript
  // TODO P1-TECH: buscar tenantSettings.timezone para suportar múltiplos fusos horários.
  timeZone: 'America/Sao_Paulo', // TODO P1-TECH: substituir por tenantSettings.timezone
  ```
- **Comportamento verificado:** Campanhas e automações usam timezone fixo `America/Sao_Paulo`. Tenants em outros fusos horários terão comportamento incorreto de agendamento.
- **Risco:** Alto — impacto direto em clientes fora do fuso de São Paulo.
- **Decisão documental:** Documentar limitação em `docs/product/known-gaps.md`.
- **Correção técnica recomendada:** Adicionar campo `timezone` a `TenantSettings` e usar nos cálculos de campanha.
- **Responsável:** Não atribuído
- **Status:** Aberto (gap técnico documentado)

---

## C-006 — Scripts destrutivos (`drop_models.js`) na raiz sem documentação de uso

- **Documento:** Nenhum
- **Afirmação atual:** Arquivo existe na raiz do projeto sem contexto.
- **Código correspondente:** `drop_models.js` — script que aparentemente apaga modelos do banco.
- **Comportamento verificado:** Arquivo presente na raiz, sem README explicando quando usar.
- **Risco:** Alto — execução acidental pode causar perda de dados.
- **Decisão documental:** Documentar em `docs/operations/runbooks/` com aviso explícito de uso restrito.
- **Correção técnica recomendada:** Mover para `scripts/maintenance/` com documentação obrigatória de uso.
- **Responsável:** Não atribuído
- **Status:** Aberto

---

## C-007 — Arquivo com nome inválido `{console.error(e)` na raiz

- **Documento:** Nenhum
- **Afirmação atual:** N/A
- **Código correspondente:** Arquivo `{console.error(e)` na raiz do repositório.
- **Comportamento verificado:** Provavelmente criado por erro de shell. Nome inválido em sistemas de arquivo.
- **Risco:** Baixo — pode causar erros em scripts ou CI que iterem arquivos da raiz.
- **Decisão documental:** Registrar como artefato inválido.
- **Correção técnica recomendada:** Remover o arquivo.
- **Responsável:** Não atribuído
- **Status:** Aberto

---

## C-008 — PushSubscription não tem model Prisma mas o serviço referencia persistência futura

- **Documento:** Nenhum
- **Afirmação atual:** `push.service.ts` menciona futura persistência em banco.
- **Código correspondente:** Schema Prisma (`apps/api/prisma/schema.prisma`) — nenhum model `PushSubscription` encontrado.
- **Comportamento verificado:** O comentário `// TODO: Criar model PushSubscription no Prisma` confirma que a funcionalidade não está implementada.
- **Risco:** Alto — subscriptions de push não são persistidas; usuários perdem subscrições ao reiniciar.
- **Decisão documental:** Classificar push como `Stub` em toda documentação.
- **Correção técnica recomendada:** Criar migration com model `PushSubscription` e implementar persistência.
- **Responsável:** Não atribuído
- **Status:** Aberto

---

## C-009 — `apps/api/.env` presente no repositório (possível vazamento de segredos)

- **Documento:** Nenhum — deveria estar no `.gitignore`
- **Afirmação atual:** N/A
- **Código correspondente:** `apps/api/.env` (3782 bytes) listado via `list_dir`.
- **Comportamento verificado:** O arquivo `.env` real existe no repositório. Verificar se está no `.gitignore` e se não contém credenciais reais.
- **Risco:** **Crítico** — se contiver segredos reais e estiver comitado no git, representa vazamento de segurança.
- **Decisão documental:** Registrar como item crítico de segurança.
- **Correção técnica recomendada:** Verificar `.gitignore`, rotacionar credenciais se comitadas, remover do histórico git se necessário.
- **Responsável:** Não atribuído
- **Status:** **Requer verificação imediata**

---

## C-010 — apps/web-tenant usa Tailwind CSS (conflito com padrão declarado)

- **Documento:** `docs/THEME-CSS-STANDARDS.md` define padrões de CSS.
- **Afirmação atual:** Padrão de CSS documentado em THEME-CSS-STANDARDS.md.
- **Código correspondente:** `apps/web-tenant/tailwind.config.js` (2518 bytes) — Tailwind está presente.
- **Comportamento verificado:** A aplicação web-tenant usa Tailwind CSS. O documento de padrões precisa ser verificado se contradiz isso ou complementa.
- **Risco:** Baixo — potencial inconsistência documental.
- **Decisão documental:** Verificar e alinhar documentação de CSS com uso real de Tailwind.
- **Correção técnica recomendada:** Nenhuma mudança de código necessária; atualizar documentação.
- **Responsável:** Não atribuído
- **Status:** Requer validação
