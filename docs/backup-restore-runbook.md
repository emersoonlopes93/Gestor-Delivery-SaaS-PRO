# Backup And Restore Runbook

## Objetivo

Garantir recuperacao do PostgreSQL antes de operar clientes pagantes. Producao controlada nao pode receber GO sem backup automatico comprovado e restore real testado em ambiente isolado nos ultimos 7 dias.

## Politica Minima

- Backup automatico ativo no provedor.
- RPO alvo:
  - sem PITR: ate 24h;
  - com PITR: ate 15min ou conforme limite do provedor.
- RTO alvo: ate 4h para restaurar operacao basica.
- Retencao minima: 7 diarios.
- Retencao ideal: 4 semanais.
- PITR habilitado quando o plano suportar.
- Restore testado antes do primeiro cliente pagante e depois ao menos semanalmente durante o piloto.
- Restore sempre em banco/branch isolado; nunca apontar frontend publico para restore.

## Responsaveis

- Primario: operador de release/infra.
- Backup: responsavel tecnico SaaS.
- Aprovacao de restauracao em producao: operador + responsavel de negocio.
- Canal de incidente: canal operacional de release/infra definido pelo time.

## Regras De Seguranca

- Nao imprimir `DATABASE_URL`, `DIRECT_URL`, credenciais, tokens ou dumps em logs.
- Nao disparar webhooks reais.
- Nao rodar jobs que enviem notificacoes.
- Nao enviar WhatsApp.
- Nao criar cobrancas reais.
- Nao conectar frontend publico ao banco restaurado.
- Apagar banco/branch restore apos validacao, salvo se for preservado como evidencia operacional controlada.

## Auditoria Atual Do Banco

Ultima verificacao: 2026-06-11.

| Campo | Status |
| --- | --- |
| Provider | Neon PostgreSQL, inferido por host `aws.neon.tech` |
| Banco | `neondb` |
| Projeto/branch Neon | Pendente; requer painel Neon ou API Neon |
| Regiao | AWS/Neon inferido; regiao exata pendente do painel |
| Plano atual Neon | Pendente de comprovacao |
| Backup automatico | Pendente de comprovacao no painel/provedor |
| PITR | Pendente de comprovacao no painel/provedor |
| Retencao | Pendente; requisito minimo 7 diarios e ideal 4 semanais |
| Ultimo backup/snapshot | Pendente de comprovacao |
| Politica suficiente para producao controlada | NO-GO ate backup automatico e restore real serem comprovados |

## Caminho A: Restore Por Dump

Use uma maquina segura, sem registrar a URL do banco em logs.

Pre-requisitos:

- `pg_dump`.
- `pg_restore`.
- Um banco PostgreSQL temporario e isolado para restore.
- Credenciais somente para a janela do teste.

Dump:

```bash
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --file backup-$(date +%Y%m%d-%H%M).dump
```

Restore:

```bash
pg_restore --clean --if-exists --no-owner --no-acl --dbname "$RESTORE_DATABASE_URL" backup.dump
```

Validacao:

```bash
RESTORE_DATABASE_URL="$RESTORE_DATABASE_URL" pnpm --filter @gestor/api smoke:database-restore
```

## Caminho B: Branch/Restore Neon

Pre-requisitos:

- Acesso ao painel Neon ou `NEON_API_KEY`.
- Permissao para criar branch restore.
- Conexao do branch de restore.

Fluxo:

1. Identificar branch principal e ponto recente.
2. Criar branch de restore a partir de ponto recente ou PITR.
3. Obter string de conexao do branch restore.
4. Rodar validacao:

```bash
RESTORE_DATABASE_URL="$RESTORE_DATABASE_URL" pnpm --filter @gestor/api smoke:database-restore
```

5. Registrar evidencia.
6. Remover branch temporario quando apropriado.

## Smoke Seguro De Restore

Comando:

```bash
pnpm --filter @gestor/api smoke:database-restore
```

Variaveis:

- `RESTORE_DATABASE_URL`: preferencial e obrigatoria para restore real.
- `RESTORE_DIRECT_URL`: opcional.
- `DATABASE_URL` pode ser usado somente com `DATABASE_RESTORE_SMOKE_CONFIRM=restore`, quando apontar explicitamente para banco restore isolado.

Marcadores:

- `DATABASE_RESTORE_SMOKE_GO`
- `DATABASE_RESTORE_SMOKE_NO_GO`

Validacoes:

- conexao DB ok;
- migrations Prisma consistentes;
- tenants legiveis;
- pedidos legiveis;
- revenue events/snapshots/invoices legiveis quando existirem;
- auth sessions contadas sem uso externo;
- consistencia obvia de invoice items.

## Checklist Pos-Restore

- [ ] Banco/branch restore e isolado.
- [ ] API publica nao aponta para o restore.
- [ ] Health DB `ok` ou smoke DB restore GO.
- [ ] Prisma consegue consultar.
- [ ] Migrations consistentes.
- [ ] Tenants esperados existem.
- [ ] Pedidos existem ou ausencia justificada.
- [ ] Revenue events existem ou ausencia justificada.
- [ ] Snapshots/invoices existem ou ausencia justificada.
- [ ] Auth sessions existem mas nao foram usadas externamente.
- [ ] Nenhum webhook real foi disparado.
- [ ] Nenhuma notificacao/WhatsApp foi enviado.
- [ ] Nenhuma cobranca real foi criada.
- [ ] Cleanup do banco/branch restore concluido ou preservacao justificada.

## Registro De Teste De Restore

| Campo | Valor |
| --- | --- |
| Data/hora | 2026-06-11 |
| Tipo de restore | Pendente |
| Banco origem | Neon PostgreSQL mascarado, host `aws.neon.tech`, DB `neondb` |
| Banco destino | Pendente |
| Metodo usado | Tentativa de preparacao; restore real bloqueado |
| Duracao aproximada | Nao aplicavel |
| Validacoes realizadas | Auditoria de provider/env; script `smoke:database-restore` criado e compilado |
| Resultado | `DATABASE_RESTORE_SMOKE_NO_GO` esperado ate haver `RESTORE_DATABASE_URL` isolada |
| Problemas encontrados | Sem `NEON_API_KEY`; sem acesso ao painel Neon; `pg_dump`, `pg_restore`, `psql` e Docker indisponiveis no runner local |
| Cleanup | Nenhum banco/branch temporario criado |
| Proximo teste recomendado | Assim que houver branch Neon restore ou banco temporario + ferramentas PostgreSQL; repetir semanalmente no piloto |

## Perda De Dados

1. Congelar deploys e jobs que escrevem no banco.
2. Pausar filas e automacoes nao essenciais.
3. Identificar janela de perda e tabelas afetadas.
4. Verificar ultimo backup e, se existir, ponto PITR.
5. Restaurar em banco isolado.
6. Comparar dados afetados antes de substituir producao.
7. Comunicar impacto, RPO real e plano de mitigacao.
8. Registrar post-incidente.

## Criterio De GO

GO somente com:

- backup automatico ativo comprovado;
- politica de retencao comprovada;
- PITR comprovado ou risco sem PITR aceito explicitamente;
- restore real testado em ambiente isolado nos ultimos 7 dias;
- `DATABASE_RESTORE_SMOKE_GO`.

Sem esses itens, o status e NO-GO para producao controlada.
