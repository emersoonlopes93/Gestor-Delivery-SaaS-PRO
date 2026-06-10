# Backup And Restore Runbook

## Objetivo

Garantir recuperacao do PostgreSQL antes de operar clientes pagantes.

## Politica

- Backup automatico diario.
- Retencao minima: 7 diarios e 4 semanais.
- PITR habilitado quando o provedor suportar.
- Restore testado em staging antes do primeiro cliente pagante e depois ao menos semanalmente.
- RPO alvo: ate 24 horas sem PITR; ate 15 minutos com PITR.
- RTO alvo: ate 4 horas para restaurar servico basico.

## Responsaveis

- Primario: operador de release/infra.
- Backup: responsavel tecnico SaaS.
- Aprovacao de restauracao em producao: operador + responsavel de negocio.

## Backup Manual

Use uma maquina segura, sem registrar a URL do banco em logs.

```bash
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-acl --file backup-$(date +%Y%m%d-%H%M).dump
```

Armazene o dump em bucket privado com criptografia e acesso restrito. Nunca envie backup por chat ou email comum.

## Restore Em Staging

1. Criar banco temporario de staging restore.
2. Aplicar o dump:

```bash
pg_restore --clean --if-exists --no-owner --no-acl --dbname "$STAGING_RESTORE_DATABASE_URL" backup.dump
```

3. Configurar API staging temporaria para apontar ao banco restaurado.
4. Rodar:

```bash
pnpm prisma:validate
pnpm --filter @gestor/api prisma:generate
pnpm --filter @gestor/api prisma:migrate:deploy
```

5. Validar health e consultas criticas.

## Checklist Pos-Restore

- [ ] API sobe com banco restaurado.
- [ ] Health DB `ok`.
- [ ] Admin login controlado funciona.
- [ ] Tenants esperados aparecem.
- [ ] Pedidos recentes existem.
- [ ] Revenue events existem.
- [ ] Snapshots/invoices consistentes.
- [ ] Auth sessions nao foram expostas fora do ambiente controlado.
- [ ] Nenhum webhook real foi disparado durante validacao.

## Perda De Dados

1. Congelar deploys e jobs que escrevem no banco.
2. Identificar janela de perda e tabelas afetadas.
3. Verificar ultimo backup e, se existir, ponto PITR.
4. Restaurar em banco isolado.
5. Comparar dados afetados antes de substituir producao.
6. Comunicar impacto, RPO real e plano de mitigacao.
7. Registrar post-incidente.

## Criterio De GO

GO somente com backup automatico ativo e restore testado em staging nos ultimos 7 dias.

## Evidencia Operacional Atual

Ultima verificacao: 2026-06-10.

| Campo | Status |
| --- | --- |
| Provedor | Neon PostgreSQL inferido pelo host do banco staging |
| Politica ativa | Pendente de comprovacao no painel/provedor |
| Frequencia | Pendente |
| Retencao | Pendente; requisito minimo 7 diarios e 4 semanais |
| PITR | Pendente de comprovacao |
| Acesso restrito | Pendente de comprovacao |
| Responsavel | Operador de release/infra |
| Restore testado | Pendente |

Resultado atual: NO-GO para producao controlada ate backup automatico e restore real serem comprovados.

## Registro De Teste De Restore

Ainda nao executado nesta fase.

Para marcar GO, preencher:

- data/hora do teste;
- banco origem;
- banco destino isolado;
- comando usado;
- tempo estimado de restore;
- validacoes executadas;
- problemas encontrados;
- resultado final.
