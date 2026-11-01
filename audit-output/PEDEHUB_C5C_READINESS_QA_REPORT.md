# PedeHub — C5-C readiness operacional de billing

## Identidade da auditoria

- Base SHA: `952d52e36dee97235a58227d93aa6c32147c5aba`
- Head inicial: `952d52e36dee97235a58227d93aa6c32147c5aba`
- Branch: `feat/billing-c5c-operational-readiness`
- PR: ainda não criada
- Worktree limpo no início: sim

## Matriz de contratos existentes

| Área | Estado | Evidência | Decisão C5-C |
| --- | --- | --- | --- |
| Sandbox versus live | Parcial/fail-closed | `billing-payment-gateway.service.ts` e `asaas-billing-client.service.ts` aceitam somente sandbox para Asaas | manter bloqueio live |
| RBAC administrativo | Existe | `AdminBillingController` usa `AdminAuthGuard`, `AdminPermissionsGuard` e `saas.billing.read` | reutilizar superfície Admin |
| Idempotência e concorrência | Existe | `billing-payment-attempt.service.ts` reserva tentativa com advisory lock e chave por invoice/provider | não duplicar rotina |
| Resultado incerto | Existe/parcial | `gatewaySubmission=unknown_outcome` permanece em `processing` | tornar a política operacional explícita; sem replay |
| Consulta live autoritativa | Contrato externo pendente | nenhum contrato oficial live versionado foi fornecido; Asaas C5-B é sandbox-only | nenhuma chamada live |
| Métricas/alertas | Parcial | logs estruturados de attempts/webhooks existem; não há plataforma de métricas homologada | documentar categorias, limiares e resposta |
| Kill switch/rollback | Existe/parcial | `isBillingAutomationEnabled()` exige ambiente não produtivo e respeita kill switch | documentar rollback sem mutação financeira |
| Verdade operacional | Parcial | portal informa sandbox/manual, mas Admin não tinha diagnóstico consolidado | endpoint Admin somente leitura |

## Implementação segura planejada

1. Expor readiness administrativo protegido, derivado exclusivamente do runtime local e sem chamadas externas.
2. Forçar `realChargeEnabled=false`, `automaticBillingActive=false` e `productionAllowed=false` em todos os cenários da C5-C.
3. Declarar `unknown_outcome` como reconciliação manual com evidência externa obrigatória e replay automático proibido.
4. Registrar checklist de autorização live, alertas e rollback no runbook.

## Limites e blockers externos

`PROVIDER_LIVE_CONTRACT_VERIFIED=NO`. Faltam contrato oficial versionado do provider live, prova de ambiente/credenciais segregados, webhook legítimo homologado, sandbox E2E de ponta a ponta e aprovações financeira/jurídica/operacional. Isto bloqueia autorização futura, mas não o diagnóstico fail-closed desta PR.

## Declarações de segurança

- `LIVE_CHARGE_ENABLED=NO`
- `REAL_CHARGE_OCCURRED=NO`
- `REMOTE_DB_MUTATED=NO`
- `DOKPLOY_CHANGED=NO`
- `VERCEL_CHANGED=NO`
- `PRODUCTION_GUARD_PRESERVED=YES`
- `UNKNOWN_OUTCOME_NO_REPLAY=YES`
- `READY_FOR_FUTURE_AUTHORIZATION=PARTIAL`

## Evidência local

| Gate | Resultado |
| --- | --- |
| `pnpm db:generate` | PASS, exit 0 |
| `pnpm --filter @gestor/api test -- src/billing/billing-operational-readiness.service.spec.ts` | PASS, 1 suite / 3 testes, exit 0 |
| Regressões `billing-payment-gateway` e `tenant-billing-portal` | PASS, 2 suites / 7 testes, exit 0 |
| Typecheck API | PASS, exit 0 |
| Typecheck Web Admin | PASS, exit 0 |
| Typecheck global | PASS, exit 0 |
| Build API | PASS, exit 0 |
| Build Web Admin | PASS, exit 0 |
| `pnpm prisma:validate` | PASS, exit 0; URLs locais somente para parser, sem conexão |
| Lint global | PASS, exit 0; 11 warnings preexistentes do Storefront |
| `check:no-any`, `check:boundaries`, `check:features`, `check:theme` | PASS, exit 0 |
| `git diff --check` | PASS, exit 0 |

Não foi executada uma chamada ao provider, mutação de banco remoto, scheduler de
produção ou teste PostgreSQL novo: a fatia C5-C é derivada somente de
configuração local e não persiste nem consulta dados. A prova PostgreSQL C5-B
já existente deve ser reexecutada pela CI no SHA final da PR.

## Diff C5-C

- Novo serviço puro de readiness e sua suíte de três cenários fail-closed.
- Endpoint Admin somente leitura com RBAC `saas.billing.read`.
- Card de verdade operacional no Console SaaS Admin.
- Runbook com política de resultado incerto, alertas, rollback e requisitos da autorização live futura.
- Sem schema, migration, flags remotas, provider live, job novo ou rota mutável.

## Publicação e CI

- Commit funcional: `0f5db6a98224bcb265b90be304ab2db1e9597095`
- Draft PR: [#176](https://github.com/emersoonlopes93/Gestor-Delivery-SaaS-PRO/pull/176)
- Base: `main-copy` em `952d52e36dee97235a58227d93aa6c32147c5aba`
- CI `build-and-migrate`: PASS — inclui a regressão C5-B recorrente em PostgreSQL efêmero.
- `Ephemeral PostgreSQL proof`: PASS.
- Secret scanning: PASS.
- Smoke com seed e E2Es de consentimento, áudio e dashboard: PASS.
- Previews Vercel de Admin, Tenant, Storefront e Delivery: PASS.

Esta atualização documental não muda o contrato funcional. A CI deve ser
reexecutada no SHA final deste relatório antes de qualquer revisão técnica.
