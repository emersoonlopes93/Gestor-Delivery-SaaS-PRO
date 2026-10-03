---
title: Inventário Documental
status: current
owner: engineering
last_verified: 2026-07-15
verified_against: main-copy / c63d394
---

# Inventário Documental — Gestor Delivery SaaS PRO

> Auditoria realizada em 2026-07-15. Branch: `main-copy`. Commit: `c63d394`.

## Documentos existentes (raiz e docs/)

| Documento | Localização | Assunto | Estado | Problema | Ação recomendada |
|-----------|-------------|---------|--------|----------|-----------------|
| `BACKEND_INFRASTRUCTURE_AUDIT.md` | Raiz | Infraestrutura backend | Parcialmente atual | Arquivo solto na raiz, não segue estrutura canônica | Consolidar em `docs/architecture/` e arquivar original |
| `IMPLEMENTATION-SUMMARY.md` | Raiz | Resumo de implementação | Parcialmente atual | Arquivo ad-hoc de sessão anterior; sem estrutura canônica | Consolidar em `docs/handoffs/` e arquivar |
| `TESTING-NOTIFICATIONS.md` | Raiz | Testes de notificações | Desatualizado | Descreve push como funcional; código confirma que é stub | Mover para `docs/audits/contradictions.md` como gap |
| `docs/GUIA_FUNCIONALIDADES.md` | `docs/` | Funcionalidades | Não verificável | Não confrontado com código; pode estar desatualizado | Substituir por `docs/product/feature-matrix.md` |
| `docs/P15-pilot-checklist.md` | `docs/` | Checklist de piloto | Órfão | Arquivo de sessão específica sem contexto canônico | Arquivar em `docs/archive/` |
| `docs/P15.2-dokploy-redeploy-package.md` | `docs/` | Deploy Dokploy | Órfão | Procedimento específico sem contexto atual | Arquivar em `docs/archive/` |
| `docs/P16.1-onboarding-audit.md` | `docs/` | Auditoria de onboarding | Parcialmente atual | Auditoria de sessão, não documentação operacional | Arquivar em `docs/archive/` |
| `docs/P16.2A-onboarding-foundation-report.md` | `docs/` | Relatório de onboarding | Parcialmente atual | Relatório de sessão, não documentação operacional | Arquivar em `docs/archive/` |
| `docs/P16.2B-onboarding-address-autocomplete-report.md` | `docs/` | Autocomplete de endereço | Parcialmente atual | Relatório de sessão | Arquivar em `docs/archive/` |
| `docs/P16.2C-onboarding-order-modes-report.md` | `docs/` | Modos de pedido | Parcialmente atual | Relatório de sessão | Arquivar em `docs/archive/` |
| `docs/THEME-CSS-STANDARDS.md` | `docs/` | Padrões de CSS/tema | Atual | Válido como guia de desenvolvimento frontend | Manter; linkar do `AGENTS.md` |
| `docs/THEME_GUIDE.md` | `docs/` | Guia de tema | Duplicado | Duplicata parcial de THEME-CSS-STANDARDS | Consolidar e arquivar o menor |
| `docs/admin-access-runbook.md` | `docs/` | Runbook admin | Parcialmente atual | Verificar comandos; estrutura OK | Manter; mover para `docs/operations/runbooks/` |
| `docs/android-bluetooth-printing.md` | `docs/` | Impressão Bluetooth | Parcialmente atual | Funcionalidade beta | Manter com classificação beta |
| `docs/api-environment-variables.md` | `docs/` | Variáveis de ambiente API | Desatualizado | Pode não cobrir variáveis novas adicionadas | Substituir por `docs/getting-started/environment-variables.md` |
| `docs/backup-restore-runbook.md` | `docs/` | Backup/restore | Atual | Runbook operacional válido | Mover para `docs/operations/runbooks/` |
| `docs/billing-ledger-http-smoke.md` | `docs/` | Smoke billing | Atual | Documento de smoke test válido | Mover para `docs/development/` |
| `docs/billing-runbook.md` | `docs/` | Runbook de billing | Atual | Runbook operacional válido | Mover para `docs/operations/runbooks/` |
| `docs/design-system-architecture.md` | `docs/` | Arquitetura design system | Atual | Documento técnico válido | Manter; linkar de `docs/architecture/` |
| `docs/first-paying-tenant-checklist.md` | `docs/` | Checklist primeiro cliente | Parcialmente atual | Checklist de lançamento; validar itens | Mover para `docs/operations/` |
| `docs/location-providers.md` | `docs/` | Provedores de localização | Atual | Documentação de integração válida | Mover para `docs/architecture/integrations.md` |
| `docs/media-library-architecture.md` | `docs/` | Arquitetura de mídia | Atual | Documento técnico válido | Mover para `docs/architecture/` |
| `docs/observability-runbook.md` | `docs/` | Runbook observabilidade | Atual | Runbook válido | Mover para `docs/operations/runbooks/` |
| `docs/production-launch-checklist.md` | `docs/` | Checklist de lançamento | Parcialmente atual | Validar itens contra código atual | Mover para `docs/operations/` |
| `docs/production-readiness-checklist.md` | `docs/` | Checklist produção | Parcialmente atual | Validar itens | Mover para `docs/operations/` |
| `docs/production-smoke-runbook.md` | `docs/` | Smoke de produção | Atual | Runbook válido | Mover para `docs/operations/runbooks/` |
| `docs/queues-runbook.md` | `docs/` | Runbook de filas | Atual | Runbook válido | Mover para `docs/operations/runbooks/` |
| `docs/rate-limit-runbook.md` | `docs/` | Rate limiting | Atual | Runbook válido | Mover para `docs/operations/runbooks/` |
| `docs/release-gates.md` | `docs/` | Gates de release | Atual | Documento de processo válido | Mover para `docs/operations/` |
| `docs/release-rollback-runbook.md` | `docs/` | Rollback | Atual | Runbook válido | Mover para `docs/operations/runbooks/` |
| `docs/scheduling-audit.md` | `docs/` | Auditoria de agendamento | Parcialmente atual | Auditoria de sessão específica | Arquivar em `docs/archive/` |
| `docs/session-security.md` | `docs/` | Segurança de sessão | Atual | Documento técnico válido | Mover para `docs/contracts/authentication.md` |
| `docs/storage-cdn-runbook.md` | `docs/` | Storage/CDN | Atual | Runbook válido | Mover para `docs/operations/runbooks/` |
| `docs/tenant-isolation-policy.md` | `docs/` | Isolamento de tenant | Atual | Política válida | Mover para `docs/contracts/tenant-isolation.md` |
| `docs/troubleshooting.md` | `docs/` | Troubleshooting | Parcialmente atual | Validar erros e soluções | Mover para `docs/getting-started/` |
| `docs/type-safety.md` | `docs/` | Segurança de tipos | Atual | Guia válido | Mover para `docs/development/` |
| `docs/webhook-security.md` | `docs/` | Segurança de webhooks | Atual | Documento de contrato válido | Mover para `docs/contracts/` |

## Arquivos ad-hoc na raiz (não são documentação)

| Arquivo | Tipo | Ação recomendada |
|---------|------|-----------------|
| `clean_schema.js` | Script de manutenção | Mover para `scripts/` ou documentar propósito |
| `clean_schema2.js` | Script de manutenção | Idem |
| `drop_models.js` | Script destrutivo | **ATENÇÃO**: script que apaga modelos; documentar uso restrito |
| `crm-enterprise-certification.json` | Artefato de QA | Mover para `qa-artifacts/` |
| `phase13-bi-certification.json` | Artefato de QA | Mover para `qa-artifacts/` |
| `Compilando`, `Instalando`, `Sincronizando` | Arquivos de lock de status | Verificar se são usados por algum processo automatizado |
| `{console.error(e)` | **Arquivo inválido** | Remover — nome de arquivo inválido, provavelmente erro de shell |
| `test-login.ts` | Script de teste ad-hoc | Mover para `scripts/` ou remover |
| `fase81-automations.png` | Imagem de documentação | Mover para `docs/` com contexto |
| `storefront.png` | Imagem | Mover para `docs/` com contexto |
| `theme-warnings-baseline.json` | Baseline de CI | Mover para `scripts/` |

## Sumário do estado documental

| Estado | Quantidade |
|--------|-----------|
| Atual | 12 |
| Parcialmente atual | 12 |
| Desatualizado | 2 |
| Duplicado | 1 |
| Órfão | 3 |
| Não verificável | 1 |
| Candidato a arquivamento | 7 |

## Documentação ausente (gaps críticos)

- ❌ `README.md` na raiz — **não existe**
- ❌ `AGENTS.md` na raiz — **não existe**
- ❌ `CONTRIBUTING.md` — **não existe**
- ❌ `docs/README.md` — **não existe**
- ❌ `docs/getting-started/` — **não existe**
- ❌ `docs/architecture/` — **não existe**
- ❌ `docs/contracts/` — **não existe**
- ❌ `docs/product/feature-matrix.md` — **não existe**
- ❌ `docs/product/known-gaps.md` — **não existe**
- ❌ `docs/development/` — **não existe**
- ❌ `docs/handoffs/` — **não existe**
- ❌ `docs/decisions/` — **não existe**
