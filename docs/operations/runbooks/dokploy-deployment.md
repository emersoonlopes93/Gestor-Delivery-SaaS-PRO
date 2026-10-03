# Deploy manual no Dokploy

> Plataforma atual: Dokploy, usando `docker-compose.prod.yml`. O arquivo `render.yaml` é legado e não descreve o fluxo operacional vigente.

## Antes do deploy

1. Confirmar a branch `main-copy`, o commit aprovado e o Auto Deploy desativado.
2. Registrar a versão atualmente implantada e garantir rollback para esse artefato.
3. Confirmar no Dokploy que `CLEAN_DB` está ausente e que os kill switches permanecem desligados:

```text
MARKETPLACE_IFOOD_BIDIRECTIONAL_ENABLED=false
MARKETPLACE_IFOOD_POLLING_FALLBACK_ENABLED=false
```

4. Criar backup verificável do PostgreSQL e confirmar que o destino de `DATABASE_URL` e `DIRECT_URL` foi auditado. Nunca registrar os valores completos dessas URLs.
5. Interromper o rollout se houver schema drift, backup não recuperável ou dúvida sobre o banco de destino.

## Migration operacional

O container normal `api` não executa migrations. No host/terminal operacional controlado pelo Dokploy, executar explicitamente o serviço isolado:

```bash
docker compose -f docker-compose.prod.yml --profile operations run --rm api-migrate
```

O serviço executa somente `npx prisma@5.22.0 migrate deploy`, não executa seed nem limpeza e termina ao concluir. Acompanhar os logs sem imprimir variáveis, exigir código de saída zero e conferir `_prisma_migrations` por um procedimento de auditoria aprovado. Qualquer falha bloqueia o deploy da aplicação.

Executar novamente é seguro apenas para confirmar que não há migrations pendentes; o Prisma deve concluir sem reaplicar migrations registradas.

## Aplicação

1. Somente depois da migration bem-sucedida, acionar manualmente o deploy/restart da API no Dokploy.
2. Acompanhar os logs de startup e confirmar que não há migration, seed, limpeza ou URL de banco impressa.
3. Validar health, readiness, Redis/BullMQ e executar os smokes aprovados para o ambiente.
4. Confirmar que nenhum tenant ou recurso iFood foi habilitado automaticamente.

5. Para rotação de JWT ou revogação de sessões, seguir também o runbook
   [`secret-rotation.md`](./secret-rotation.md); não executar migration nesta
   janela.
6. Valores reais pertencem somente ao secret manager do Dokploy. Antes de
   restart ou deploy, confirmar que não há definições conflitantes entre
   environment, env files montados, compose, build args, shared variables e
   variáveis de projeto/serviço. Nunca imprimir valores.

## Rollback

1. Desligar primeiro os kill switches da capacidade afetada.
2. Voltar a aplicação para a imagem/commit anteriormente registrado.
3. Não remover migrations já aplicadas e não usar `prisma db push`.
4. Preferir forward-fix para migrations aditivas. Restaurar backup somente quando o incidente justificar a perda controlada de mudanças posteriores e houver aprovação operacional.

## Limpeza destrutiva de desenvolvimento

`clean_db.js` não faz parte da imagem nem do startup de produção. Seu uso é exclusivamente local, destrutivo e exige simultaneamente `NODE_ENV` diferente de `production`, `CLEAN_DB=true` e o comando explícito `pnpm --filter @gestor/api prisma:clean:development`. Nunca executar contra staging ou produção.
