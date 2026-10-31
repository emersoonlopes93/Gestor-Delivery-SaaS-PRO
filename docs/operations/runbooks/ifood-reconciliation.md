---
title: Runbook — Reconciliação iFood
status: current
owner: engineering
last_verified: 2026-07-16
---

# Runbook — Reconciliação iFood

> Operação e reconciliação validadas por testes contratuais; homologação iFood pendente.

## Pré-condições

- usar identidade SaaS Admin com `saas.marketplace.read`; mutações exigem `saas.marketplace.manage`;
- informar `tenantId` explicitamente em toda consulta;
- manter `MARKETPLACE_IFOOD_BIDIRECTIONAL_ENABLED=false` até migrations, secrets, Redis/BullMQ e homologação estarem validados;
- nunca copiar token, secret, `Authorization`, raw payload ou dados pessoais para ticket/log.

## Sintoma e identificação

| Sintoma | Como identificar com segurança | Ação inicial |
|---|---|---|
| operação pendente antiga | `GET /admin/marketplace/operations?tenantId=...&status=ACCEPTED` e métricas | consultar detalhe e aguardar/reconciliar; não replayar aceita |
| confirmação perto do prazo | `confirmationsNearDeadline > 0` | verificar worker, fila e credencial imediatamente |
| deadline vencido | `deadlinesExpired > 0` ou divergência `OPERATION_TIMEOUT` | consultar estado remoto; não forçar `Order.status` |
| falha permanente | `GET /admin/marketplace/failures?tenantId=...` | validar `httpStatus`, `providerCode` e ação recomendada |
| autenticação | divergência `AUTHENTICATION_FAILURE`/conexão `TOKEN_EXPIRED` | reconectar ou rotacionar credenciais antes de retry |
| merchant sem vínculo | log `marketplace_merchant_mapping_failure` e inbox `FAILED` | corrigir `MarketplaceConnection`; reprocessar o evento |
| eventos duplicados | `duplicateEvents` crescente | esperado em baixa taxa; investigar origem se houver pico |
| eventos fora de ordem | `outOfOrderEvents` crescente | confirmar que linhas ficaram `IGNORED`; não reprocessar |
| worker parado | readiness Redis/BullMQ falha e idade da operação cresce | restaurar worker/Redis e observar a próxima varredura |
| muitas assinaturas inválidas | log `marketplace_webhook_signature_invalid` | validar secret/configuração e origem; não desabilitar HMAC |
| muitos `429`/`5xx` | métricas `rateLimitResponses`/`provider5xxResponses` | reduzir ações manuais e respeitar backoff/`Retry-After` |

## Consultas administrativas

```text
GET /admin/marketplace/metrics?tenantId=<tenant>
GET /admin/marketplace/operations?tenantId=<tenant>&page=1&pageSize=25
GET /admin/marketplace/failures?tenantId=<tenant>&page=1&pageSize=25
GET /admin/marketplace/divergences?tenantId=<tenant>&status=OPEN
GET /admin/marketplace/operations/<operationId>?tenantId=<tenant>
GET /admin/marketplace/operations/<operationId>/history?tenantId=<tenant>
```

As respostas são allowlists sanitizadas. Use esses endpoints em vez de consultas manuais ao banco. Se uma investigação excepcional exigir SQL, execute somente leitura, com filtro `tenant_id`, limite e aprovação operacional.

## Retry seguro

1. Leia operação, histórico e divergências.
2. Confirme tenant, pedido interno/externo, estado local e último estado remoto.
3. Se `ACCEPTED`, não faça retry: a API força reconciliação e recusa replay enquanto o estado permanecer inconclusivo.
4. Corrija credencial, mapping ou indisponibilidade primeiro.
5. Para `FAILED`/`INTERVENTION_REQUIRED`, solicite:

```text
POST /admin/marketplace/operations/<operationId>/retry?tenantId=<tenant>
```

O endpoint reconcilia antes, cria operação filha/correlation ID, audita admin/IP e limita três retries. Resposta `400` é uma barreira de segurança, não autorização para manipular a fila.

Para apenas reconhecer uma divergência:

```text
POST /admin/marketplace/divergences/<divergenceId>/acknowledge?tenantId=<tenant>
{ "note": "ticket ou decisão operacional sem dados sensíveis" }
```

Reconhecimento não resolve nem altera o pedido.

## Rotação de credenciais

1. Configure a nova chave e versão como atuais.
2. Mantenha chave/versão anteriores somente durante a janela controlada.
3. Execute `POST /admin/marketplace/connections/<connectionId>/rotate-credentials?tenantId=<tenant>`.
4. Valide obtenção/refresh de token sem expor ciphertext.
5. Remova a chave anterior apenas quando todas as conexões estiverem em `enc:v2:<versão-atual>`.

## Ações proibidas

- editar `Order.status`, `MarketplaceOperation.status` ou divergência diretamente no banco;
- executar `prisma db push`;
- reenfileirar job BullMQ manualmente ou usar retry infinito;
- repetir operação `ACCEPTED` ou `SUCCEEDED`;
- ignorar `ORDER_STATUS_TRANSITIONS`;
- desabilitar assinatura HMAC, rate limit ou guard administrativo;
- registrar token, secret, header completo, raw payload ou dados pessoais;
- adicionar polling improvisado sem ACK, filtros, presença e rate limits homologados.

## Escalonamento

| Condição | Severidade | Escalonar para |
|---|---|---|
| deadline próximo com fila/credencial indisponível | Alta | on-call backend + operação do tenant |
| vários deadlines vencidos ou worker parado | Crítica | on-call plataforma/infra |
| autenticação falhando em vários merchants | Alta | integração iFood + gestão de secrets |
| assinaturas inválidas em pico | Alta | segurança + integração iFood |
| `429` persistente | Média/Alta | integração iFood; suspender retries manuais |
| estado remoto desconhecido após recuperação | Alta | suporte iFood com correlation IDs sanitizados |

## Validação posterior

- operação original e retry filho aparecem no histórico;
- estado local só mudou por transição permitida;
- operação termina `SUCCEEDED` ou permanece explicitamente visível;
- divergência fica `RESOLVED` somente após evidência remota/local;
- métricas de pendência/deadline retornam ao normal;
- audit log contém solicitante, tenant, recurso e correlation ID;
- nenhum segredo ou dado pessoal foi incluído em logs/tickets.

## Alertas e canal disponível

O projeto ainda não possui Alertmanager/PagerDuty/Slack integrado. O canal disponível é log estruturado + health/readiness + endpoint de métricas. Configure no provedor de logs alertas para:

- `marketplace_confirmation_deadline_near` ou `marketplace_confirmation_deadline_expired`;
- `marketplace_operation_failed` repetido por tenant/merchant;
- `marketplace_divergence_open` em crescimento;
- `marketplace_webhook_signature_invalid` em pico;
- `marketplace_merchant_mapping_failure`;
- readiness de Redis/BullMQ não saudável;
- `oldestOperationAgeMs` e `deadlinesExpired` acima do limite operacional.

Para rollout e rollback de staging, use o [runbook de staging](./ifood-staging-rollout.md). Conexão iFood bloqueada ou stale degrada a seção marketplace do health, mas não derruba isoladamente a readiness global da API.
