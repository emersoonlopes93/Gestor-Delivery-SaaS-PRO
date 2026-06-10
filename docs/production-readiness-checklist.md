# Production Readiness Checklist

Checklist para primeiros clientes pagantes em producao controlada.

## Deploy

- `NODE_ENV=production`.
- `pnpm prisma:validate`, `pnpm typecheck`, `pnpm lint`, `pnpm test` e `pnpm build` executados no CI.
- `prisma migrate deploy` executado antes de subir a API.
- Ambiente staging separado de producao, com banco e storage proprios.
- Secrets configurados fora do repositorio.
- `CORS_ORIGINS` restrito aos dominios finais.
- Swagger desligado, exceto ambiente interno protegido.

## Banco De Dados

- PostgreSQL com backup automatico diario.
- Retencao minima: 7 backups diarios e 4 semanais.
- Restore testado em staging antes do primeiro cliente pagante.
- PITR habilitado quando o provedor suportar.
- Usuario de aplicacao sem privilegio de superuser.
- Migrações revisadas antes de deploy.

## Restore Testado

1. Criar banco vazio em staging.
2. Restaurar ultimo backup.
3. Rodar `pnpm --filter @gestor/api prisma:migrate:deploy`.
4. Subir API apontando para banco restaurado.
5. Validar `/api/v1/health`.
6. Validar login admin, login tenant, listagem de pedidos e billing.

## Redis, Filas E Jobs

- `REDIS_ENABLED=true` em producao.
- `REDIS_HOST` nao pode ser localhost.
- `BULLMQ_ENABLED=true` para jobs recorrentes e criticos.
- `CAMPAIGNS_DISPATCH_ENABLED=false` para primeiros clientes, salvo plano controlado.
- Retry exponencial para jobs criticos.
- Dead letter queue ou fila de falhas monitorada.
- Alertas para fila acumulada, job falhando e Redis indisponivel.

## Storage E CDN

- `STORAGE_DRIVER=r2` ou equivalente S3.
- `MEDIA_PUBLIC_BASE_URL`/`R2_PUBLIC_BASE_URL` configurado.
- Storage local proibido em producao.
- CDN com cache para imagens publicas.
- Politica de delete/retencao alinhada com LGPD.

## Billing

- Planos e faixas revisados no SaaS Admin.
- Snapshot fechado nao deve ser recalculado.
- Invoice deve ser criada a partir de ciclo fechado.
- Payment attempts auditados.
- Tenant suspenso deve acessar apenas billing e auth.
- Pagamento confirmado deve reativar assinatura e tenant.
- Toda suspensao/reativacao manual deve gerar audit log.

## Seguranca

- JWT secrets fortes e diferentes entre acesso e refresh.
- Impersonation apenas via `POST`, com motivo e permissao especifica.
- Tokens impersonados com expiracao curta.
- Webhooks com assinatura e idempotencia.
- Rate limit especifico para auth, endpoints publicos e webhooks.
- Helmet ativo.
- Validacao global com whitelist ativa.
- RBAC revisado para admin e tenant.

## Observabilidade Minima

- Logs JSON coletados centralmente.
- Alertas para 5xx, latencia alta, falha DB, falha Redis e jobs em erro.
- `/api/v1/health` monitorado externamente.
- Admin Health usado em atendimento.
- Logs de billing e tenant status retidos para auditoria.

## Go/No-Go

- Sem tenants usando billing legado sem plano de migracao.
- Sem modulo beta visivel para cliente inicial sem feature flag explicita.
- Sem erro de typecheck/build.
- Restore testado nos ultimos 7 dias.
- Plano de rollback documentado para API e frontends.
