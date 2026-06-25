# Release And Rollback Runbook

## Promover Release

1. Confirmar commit alvo.
2. Rodar gates locais/CI.
3. Confirmar Staging Smoke Gate verde.
4. Confirmar backup recente e restore testado.
5. Revisar migrations.
6. Definir plano de rollback.
7. Agendar janela com responsavel primario e backup.

## Verificar Versao

- Conferir commit no provedor de deploy.
- Conferir `headSha` no GitHub Actions.
- Registrar commit no relatorio de release.

## Deploy

1. Aplicar migrations com `prisma migrate deploy`.
2. Deploy API.
3. Deploy frontends.
4. Validar health publico e admin.
5. Rodar smoke minimo de producao.
6. Monitorar 5xx, latencia, checkout, webhooks e billing por 30 minutos.

## Rollback API

1. Confirmar que a falha e regressao de release.
2. Pausar jobs/campanhas se necessario.
3. Voltar para ultimo deploy estavel no provedor.
4. Validar health.
5. Rodar smoke minimo.
6. Registrar impacto.

## Rollback Frontends

1. Reverter para build anterior.
2. Validar login, storefront e checkout visual.
3. Limpar cache/CDN se necessario.

## Migration Irreversivel

- Nao aplicar sem plano escrito.
- Preferir migrations expand/contract.
- Para rollback, usar hotfix forward quando dados ja mudaram.
- Restaurar backup somente com aprovacao explicita e avaliacao de perda.

## Bloqueios De Release

- Staging Smoke Gate falhou.
- Billing smoke falhou.
- Backup indisponivel.
- Restore nao testado nos ultimos 7 dias.
- Health staging ou producao degradado.
- Redis/BullMQ indisponivel.
- Plano de rollback ausente.

## Comunicacao De Incidente

Mensagem minima:

- impacto;
- horario de inicio;
- servicos afetados;
- mitigacao em andamento;
- proxima atualizacao.
