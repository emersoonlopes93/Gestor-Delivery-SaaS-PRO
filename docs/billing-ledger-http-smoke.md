# Billing Ledger HTTP Smoke

## Objetivo

Validar em staging/producao controlada o fluxo real via HTTP:

`login admin -> tenant owner -> checkout -> status completed -> revenue event -> snapshot ledger -> invoice -> payment attempt -> pagamento confirmado -> historico -> auditoria`.

Este smoke valida autenticacao JWT, guards, permissoes, tenant context e endpoints reais. Ele nao adiciona feature de produto.

## Script

Arquivo:

```bash
apps/api/scripts/smoke-test-billing-ledger-http-flow.ts
```

Comando:

```bash
pnpm --filter @gestor/api smoke:billing-ledger-http-flow
```

## Envs Obrigatorias

```bash
SMOKE_API_BASE_URL="http://localhost:3333/api/v1"
SMOKE_ADMIN_EMAIL="admin@saas.com"
SMOKE_ADMIN_PASSWORD="admin123"
SMOKE_TENANT_OWNER_EMAIL="billing-ledger-smoke@example.com"
SMOKE_TENANT_OWNER_PASSWORD="Password@123"
```

Envs opcionais:

```bash
SMOKE_CLEANUP=true
SMOKE_TENANT_PREFIX=billing-ledger-http-smoke
```

O email do tenant owner recebe sufixo unico usando `+timestamp`, para evitar colisao entre execucoes.

## Configuracao Do Gateway De Billing

O endpoint HTTP de payment attempt usa a configuracao runtime da API. Para smoke em staging/local, a API alvo precisa estar com pagamentos SaaS habilitados:

```bash
BILLING_PAYMENTS_ENABLED=true
BILLING_GATEWAY_PROVIDER=mock
BILLING_GATEWAY_MODE=sandbox
```

Alternativamente, use `manual/manual` se o ambiente estiver configurado para provider manual.

## Fluxo Validado

1. Admin sem token nao acessa endpoint admin de auditoria.
2. Login admin em `/auth/admin/login`.
3. Registro real de tenant owner em `/auth/tenant/register`.
4. Login tenant em `/auth/tenant/login`.
5. Tenant token nao acessa endpoint admin.
6. Admin cria/valida assinatura em `/admin/billing/tenants/:tenantId/subscription`.
7. Tenant configura loja via:
   - `/tenant/settings`
   - `/tenant/operating-hours`
   - `/delivery/coverage`
8. Tenant cria categoria e produto.
9. Cliente cria pedido via `/orders/public-checkout/:slug`.
10. Tenant move pedido por:
   - `confirmed`
   - `preparing`
   - `ready_for_pickup`
   - `completed`
11. Admin valida `revenue_event` em `/admin/billing/audit/revenue-events`.
12. Admin cria ciclo em `/admin/billing/cycles/current`.
13. Admin fecha ciclo e gera invoice draft em `/admin/billing/cycles/:cycleId/close-and-draft-invoice`.
14. Admin valida snapshot em `/admin/billing/audit/snapshots`.
15. Admin valida invoice em `/admin/billing/invoices/:invoiceId`.
16. Admin cria payment attempt em `/admin/billing/invoices/:invoiceId/payment-attempts`.
17. Admin confirma pagamento em `/admin/billing/payment-attempts/:attemptId/mark-paid`.
18. Admin valida historico em `/admin/billing/audit/subscription-history`.
19. Admin roda health em `/admin/health/system`.
20. Cleanup seguro remove apenas tenant cujo slug/nome comece com `SMOKE_TENANT_PREFIX`.

## Criterios De GO

O script imprime:

```bash
BILLING_LEDGER_HTTP_SMOKE_GO
```

E o relatorio contem IDs de tenant, pedido, revenue event, snapshot, invoice, payment attempt e historico.

## Criterios De NO-GO

O script imprime:

```bash
BILLING_LEDGER_HTTP_SMOKE_NO_GO
```

Possiveis causas comuns:

- env obrigatoria ausente;
- API base sem `/api/v1`;
- admin seed inexistente ou senha incorreta;
- gateway de billing desabilitado;
- tenant sem permissoes seedadas;
- loja nao abre por falta de configuracao operacional;
- endpoint de auditoria nao protegido por `saas.billing.audit`;
- cleanup recusado porque tenant nao tem prefixo de smoke.

## Cuidados Com Staging

- Use sempre `SMOKE_TENANT_PREFIX` dedicado.
- Mantenha `SMOKE_CLEANUP=true` por padrao.
- Nunca rode apontando para producao real sem credenciais e prefixo especificos de smoke.
- O cleanup fisico usa Prisma apenas no final porque nao ha endpoint admin seguro de delete tenant.
