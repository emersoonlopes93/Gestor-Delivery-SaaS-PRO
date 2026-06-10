# Release Gates

## Staging Billing Ledger Smoke

Gate obrigatorio para liberar uma versao que altera billing, pedidos, tenant status, auditoria financeira ou autenticacao admin.

Workflow:

```bash
.github/workflows/staging-smoke.yml
```

Comando executado:

```bash
pnpm --filter @gestor/api smoke:billing-ledger-http-flow
```

Secrets:

```bash
SMOKE_API_BASE_URL
SMOKE_ADMIN_EMAIL
SMOKE_ADMIN_PASSWORD
SMOKE_TENANT_OWNER_EMAIL
SMOKE_TENANT_OWNER_PASSWORD
STAGING_DATABASE_URL
```

Regra de GO:

- o script precisa imprimir `BILLING_LEDGER_HTTP_SMOKE_GO`;
- nao pode imprimir `BILLING_LEDGER_HTTP_SMOKE_NO_GO`;
- cleanup precisa concluir com sucesso;
- o relatorio precisa conter IDs de tenant, pedido, revenue event, snapshot, invoice, payment attempt e historico.

Regra de NO-GO:

- secret ausente;
- staging sem migracoes aplicadas;
- Prisma Client nao gera;
- endpoint admin/auditoria sem RBAC correto;
- tenant comum consegue acessar auditoria;
- pedido concluido nao gera `revenue_event`;
- snapshot nao usa `ledger`;
- invoice nao referencia snapshot/regra;
- pagamento confirmado nao reativa assinatura/tenant quando aplicavel;
- historico de status ausente;
- cleanup falha.

Antes de promover staging para producao, rode tambem:

```bash
pnpm prisma:validate
pnpm --filter @gestor/api prisma:migrate:deploy
pnpm --filter @gestor/api prisma:generate
pnpm typecheck
pnpm --filter @gestor/api test
pnpm lint
pnpm build
```
