# Production Launch Checklist

Checklist final antes do primeiro cliente pagante. A decisao so pode ser GO quando todos os itens criticos estiverem marcados e evidenciados.

## Release E Aplicacao

- [ ] Commit de release identificado e anotado.
- [ ] `pnpm prisma:validate` passou.
- [ ] `pnpm --filter @gestor/api prisma:generate` passou.
- [ ] `pnpm typecheck` passou.
- [ ] `pnpm --filter @gestor/api test` passou.
- [ ] `pnpm lint` passou sem erro bloqueante.
- [ ] `pnpm build` passou.
- [ ] Migrations aplicadas em staging com `prisma migrate deploy`.
- [ ] Staging Smoke Gate verde com `SESSION_SECURITY_HTTP_SMOKE_GO`, `WEBHOOK_SECURITY_SMOKE_GO` e `BILLING_LEDGER_HTTP_SMOKE_GO`.
- [ ] Health de staging `ok`.

## Infraestrutura

- [ ] PostgreSQL de producao criado fora do ambiente de staging.
- [ ] `DATABASE_URL` e `DIRECT_URL` apontam para producao correta.
- [ ] Backup automatico diario habilitado.
- [ ] Retencao minima: 7 backups diarios e 4 semanais.
- [ ] PITR habilitado quando suportado pelo provedor.
- [ ] Restore testado em staging nos ultimos 7 dias.
- [ ] Redis remoto configurado; nunca `localhost`.
- [ ] `REDIS_ENABLED=true`.
- [ ] `BULLMQ_ENABLED=true`.
- [ ] Health admin mostra Redis e BullMQ.
- [ ] Storage remoto configurado com `STORAGE_DRIVER=r2` ou equivalente.
- [ ] CDN/public base URL configurada para midias publicas.
- [ ] Storage local bloqueado em producao.

## Seguranca E Secrets

- [ ] `JWT_SECRET` forte, unico e com pelo menos 32 caracteres.
- [ ] `JWT_REFRESH_SECRET` forte, unico, diferente de `JWT_SECRET`.
- [ ] `CORS_ORIGINS` restrito aos dominios reais.
- [ ] `SWAGGER_ENABLED=false`.
- [ ] `ASAAS_WEBHOOK_HMAC_SECRET` configurado.
- [ ] `ASAAS_WEBHOOK_ALLOW_LEGACY_TOKEN=false`.
- [ ] `WEBHOOK_SECURITY_SMOKE_ENABLED=false`.
- [ ] Secrets revisados sem valores padrao.
- [ ] Admin inicial criado por procedimento seguro, sem senha padrao.
- [ ] Permissoes SaaS admin revisadas.
- [ ] `saas.billing.audit` concedido apenas a perfis corretos.
- [ ] Impersonation restrito e auditavel.

## Operacao

- [ ] Rate limits criticos ativos para auth, checkout, webhook, upload e storefront.
- [ ] Logs estruturados ativos.
- [ ] Logs centralizados em provedor operacional.
- [ ] Alertas ativos para 5xx, latencia alta, DB, Redis, filas, webhook, billing cycle e checkout.
- [ ] Dashboard basico de health configurado.
- [ ] Runbook de rollback aprovado antes do deploy.
- [ ] Responsavel primario e backup definidos para janela de release.

## Billing E Primeiro Tenant

- [ ] Billing gateway configurado no modo correto.
- [ ] Plano/faixa do tenant piloto configurado.
- [ ] Trial/grace revisados.
- [ ] Storefront do tenant piloto validado.
- [ ] Dominio/storefront validado.
- [ ] Pedido teste controlado criado/concluido.
- [ ] Revenue event validado.
- [ ] Snapshot e invoice validados em ambiente controlado.
- [ ] LGPD minima revisada: privacidade, retencao e exclusao.

## Decisao

- [ ] GO de engenharia.
- [ ] GO de operacao.
- [ ] GO comercial/suporte.
- [ ] Janela de rollback definida.
