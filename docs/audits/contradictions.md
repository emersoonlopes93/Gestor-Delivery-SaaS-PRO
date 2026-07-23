---
title: Registro de Contradições
status: current
owner: engineering
last_verified: 2026-07-23
verified_against: main-copy / 78daea7a
---

# Registro de Contradições — Gestor Delivery SaaS PRO

> Contradições identificadas entre documentação e código-fonte. Cada item inclui evidência, risco e recomendação.

---

## C-001 — Push Notifications descritas como funcionais em TESTING-NOTIFICATIONS.md

- **Documento:** `TESTING-NOTIFICATIONS.md` (raiz)
- **Afirmação anterior:** Descrevia processo de testar notificações push como se fossem enviadas de fato.
- **Código correspondente:** `apps/api/src/notifications/push.service.ts`
- **Status:** ✅ **RESOLVIDO em 2026-07-15 (migration `20260715234118`).**
- **Resolução verificada em 2026-07-23:**
  - `PushService` usa `web-push` real com VAPID; entra em modo degradado (warn) se chaves ausentes
  - `PushSubscriptionService` implementado com upsert tenant-scoped e unique constraint
  - `PushNotificationProcessor` (BullMQ) com `findMany` tenant-scoped e cleanup automático em HTTP 404/410
  - Migration `20260715234118_create_push_subscriptions` cria tabela `push_subscriptions` com FK para `tenants`
  - Contrato formal em `docs/contracts/push-notifications.md`
  - `TESTING-NOTIFICATIONS.md` atualizado para refletir estado real
- **Gaps remanescentes:**
  - Push para `tenant_user` (staff) não implementado
  - Notificação de cancelamento para entregador ausente
  - Sem teste E2E automatizado do fluxo completo

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
- **Afirmação anterior:** Não documentado.
- **Código correspondente:** `apps/api/src/campaigns/services/campaign.processor.ts`
- **Status:** ✅ **RESOLVIDO na Sprint 6C (2026-07-22).**
- **Resolução verificada em 2026-07-23:**
  - `nextAllowedAttempt()` busca `tenantSettings.timezone` via Prisma
  - Fallback explícito para `America/Sao_Paulo` quando timezone ausente ou inválido
  - Não depende do timezone do host; não derruba o worker
  - Documentado em `docs/product/known-gaps.md` como resolvido

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
- **Status:** ✅ **RESOLVIDO em 2026-07-23** — arquivo removido via `del /f`.

---

## C-008 — PushSubscription não tem model Prisma mas o serviço referencia persistência futura

- **Documento:** Nenhum
- **Afirmação anterior:** `push.service.ts` mencionava futura persistência em banco.
- **Código correspondente:** Schema Prisma (`apps/api/prisma/schema.prisma`)
- **Status:** ✅ **RESOLVIDO em 2026-07-15 (migration `20260715234118`).**
- **Resolução verificada em 2026-07-23:**
  - Tabela `push_subscriptions` criada com:
    - FK para `tenants` com `ON DELETE CASCADE`
    - Unique `(tenant_id, recipient_id, recipient_type, endpoint)`
    - Índice composto `(tenant_id, recipient_id, recipient_type, is_active)`
    - Campos: `endpoint`, `p256dh_key`, `auth_key`, `user_agent`, `is_active`, `last_used_at`
  - `PushSubscriptionService` usa upsert com a chave única composta
  - `PushNotificationProcessor` faz `findMany` tenant-scoped e deleta subscriptions expiradas

---

## C-009 — `apps/api/.env` presente no repositório (possível vazamento de segredos)

- **Documento:** Nenhum — deveria estar no `.gitignore`
- **Afirmação anterior:** `apps/api/.env` (3782 bytes) listado via `list_dir`.
- **Status:** ✅ **RESOLVIDO — verificado em 2026-07-23.**
- **Verificação:**
  - `git check-ignore -v apps/api/.env` → coberto pela regra `.env` na linha 10 do `.gitignore`
  - `git ls-files --error-unmatch apps/api/.env` → `error: pathspec did not match any file(s) known to git` (arquivo NÃO rastreado)
  - O arquivo existe localmente para desenvolvimento mas não está no histórico git
- **Ação necessária:** Nenhuma — situação segura.

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

---

## C-011 — iFood descrito como sincronização de catálogo e pedidos

- **Documento:** `docs/product/feature-matrix.md` (descrição anterior).
- **Comportamento verificado:** Não existe sincronização de catálogo. O núcleo de pedidos agora possui confirmação/cancelamento reais por contrato, OAuth, operação persistente e reconciliação por evento.
- **Risco:** Alto — promessa comercial maior que o produto e confusão entre implementação testada e homologação externa.
- **Decisão:** Descrição corrigida para pedidos bidirecionais Beta; catálogo explicitamente fora do escopo; homologação iFood registrada como pendente.
- **Status:** Resolvido documentalmente em 2026-07-16.
