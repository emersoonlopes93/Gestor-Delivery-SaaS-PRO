# Rollout do release candidate iFood em staging

> Release candidate preparado para staging. Integração ainda não homologada pelo iFood. Kill switches permanecem desabilitados.

## Pré-deploy

1. Registrar commit/artefato atualmente implantado e criar backup verificável do PostgreSQL.
2. Confirmar restore testado, Redis/BullMQ saudáveis e acesso de rollback.
3. Validar migrations em cópia de staging e revisar `prisma migrate status`; nunca usar `prisma db push`.
4. Confirmar no ambiente:

```text
MARKETPLACE_IFOOD_BIDIRECTIONAL_ENABLED=false
MARKETPLACE_IFOOD_POLLING_FALLBACK_ENABLED=false
```

5. Não inserir credenciais em comandos, logs ou tickets.

## Deploy com capacidades desligadas

1. Aplicar migrations pelo serviço manual `api-migrate` somente após backup e aprovação operacional de staging, seguindo o [runbook do Dokploy](./dokploy-deployment.md).
2. Validar schema, iniciar API e workers, executar smoke de startup e inspecionar health.
3. Confirmar que nenhum job de polling foi criado e nenhum tenant foi ativado automaticamente.
4. Inspecionar métricas de fila, erros de autenticação, assinaturas inválidas e logs sanitizados.

## Checklist do tenant piloto

- [ ] tenant e entitlement corretos;
- [ ] um merchant/conexão de homologação, nunca tenant real sem credenciais oficiais;
- [ ] ambiente e OAuth client de homologação confirmados;
- [ ] tokens cifrados e nenhuma credencial plaintext;
- [ ] `presenceMode` explícito e sem presença dupla;
- [ ] `pollingFallbackEnabled` inicialmente `false`;
- [ ] permissões `saas.marketplace.read/manage` verificadas;
- [ ] dashboard/health, logs e alerta do provedor observáveis;
- [ ] operador e janela de rollback definidos.

Ativação, quando houver credenciais oficiais e aprovação: habilitar primeiro o bidirecional, validar filas e webhook, optar o único tenant, e só então habilitar polling. Executar todos os cenários do [runbook de homologação](./ifood-homologation.md).

## No-go

Schema drift, migration pendente, backup/restore não comprovado, Redis/BullMQ degradado, presença contraditória, credencial inválida, HMAC falhando, ACK antes da persistência, duplicação de efeito ou teste global vermelho impedem ativação.

## Rollback

1. Desligar `MARKETPLACE_IFOOD_POLLING_FALLBACK_ENABLED` e aguardar jobs ativos terminarem.
2. Desligar `MARKETPLACE_IFOOD_BIDIRECTIONAL_ENABLED` se a operação bidirecional também precisar ser suspensa.
3. Desabilitar opt-in do piloto e restaurar o único modo de presença escolhido.
4. Parar/reverter workers e aplicação para o artefato registrado, mantendo o banco aditivo.
5. Preservar eventos, operações, conexões, divergências e auditoria; não executar `DROP` nem apagar credenciais como mecanismo de rollback.
6. Se uma migration aditiva causar incompatibilidade, preferir forward-fix aprovado. Rollback destrutivo exige plano próprio, backup e aprovação.
7. Validar health, filas, ausência de novos polls e integridade dos dados após a reversão.
