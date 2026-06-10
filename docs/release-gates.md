# Release Gates

## Staging Security And Billing Smokes

Gate obrigatorio para liberar uma versao que altera auth/session, webhooks, billing, pedidos, tenant status, auditoria financeira ou autenticacao admin.

Workflow:

```bash
.github/workflows/staging-smoke.yml
```

Comandos executados:

```bash
pnpm --filter @gestor/api prisma:migrate:deploy
pnpm prisma:validate
pnpm --filter @gestor/api prisma:generate
pnpm --filter @gestor/api smoke:session-security-http-flow
pnpm --filter @gestor/api smoke:webhook-security-flow
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
ASAAS_WEBHOOK_HMAC_SECRET
```

Staging API env:

```bash
WEBHOOK_SECURITY_SMOKE_ENABLED=true
ASAAS_WEBHOOK_HMAC_SECRET=<same secret used by the workflow>
WEBHOOK_REPLAY_WINDOW_SECONDS=300
ASAAS_WEBHOOK_ALLOW_LEGACY_TOKEN=false
```

Regra de GO:

- o session smoke precisa imprimir `SESSION_SECURITY_HTTP_SMOKE_GO`;
- o webhook smoke precisa imprimir `WEBHOOK_SECURITY_SMOKE_GO`;
- o script precisa imprimir `BILLING_LEDGER_HTTP_SMOKE_GO`;
- nenhum smoke pode imprimir o marcador `NO_GO`;
- nao pode imprimir `BILLING_LEDGER_HTTP_SMOKE_NO_GO`;
- cleanup precisa concluir com sucesso;
- o relatorio precisa conter IDs de tenant, pedido, revenue event, snapshot, invoice, payment attempt e historico.

Regra de NO-GO:

- secret ausente;
- staging sem migracoes aplicadas;
- Prisma Client nao gera;
- refresh token antigo reutilizado sem comprometer/revogar familia;
- logout ou logout global sem invalidar `sid`;
- impersonation retornando refresh token;
- webhook sem assinatura, assinatura invalida ou timestamp antigo aceito;
- webhook duplicado reprocessado;
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
