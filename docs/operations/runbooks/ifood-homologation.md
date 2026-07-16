# Runbook de homologação iFood — Sprint 5C

## Objetivo e fontes oficiais

Validar polling, ACK, presença, deduplicação e operação sem expor credenciais. Contratos consultados em 2026-07-16:

- [Polling de eventos](https://developer.ifood.com.br/pt-BR/docs/guides/modules/events/polling-overview/)
- [Presença](https://developer.ifood.com.br/pt-BR/docs/guides/modules/events/presence/)
- [Presença no webhook](https://developer.ifood.com.br/pt-BR/docs/guides/modules/events/webhook-presence/)
- [Autenticação centralizada](https://developer.ifood.com.br/pt-BR/docs/guides/modules/authentication/centralized/)
- [Erros de autenticação](https://developer.ifood.com.br/pt-BR/docs/guides/modules/authentication/errors-and-troubleshooting/)

Contrato adotado: `GET /events/v1.0/events:polling` a cada 30 segundos, Bearer JWT, `x-polling-merchants` obrigatório e no máximo 100 merchants por chamada. Esta implementação usa um merchant por job. Respostas 200 contêm array; 204 significa vazio; limite absoluto 6.000 RPM/token. O ACK é `POST /events/v1.0/events/acknowledgment`, IDs únicos e lotes de até 2.000 (limite conservador; a referência técnica também cita payload máximo de 10.000).

## Pré-requisitos

- conta Profissional/CNPJ, app e merchant de homologação autorizados;
- migration `20260716190000_ifood_polling_fallback` aplicada em staging;
- Redis e BullMQ saudáveis;
- secrets configurados no secret manager, nunca em ticket/log;
- `ifood_marketplace` habilitada apenas para o tenant piloto;
- conexão `CONNECTED`, merchant ID correto e `pollingFallbackEnabled=true`;
- presença do Developer Portal configurada por merchant; não combinar webhook e polling para o mesmo merchant;
- ambos kill switches ainda `false` durante a preparação.

## Ativação controlada

1. Verifique `/admin/health` e `GET /admin/marketplace/connections/polling?tenantId=<tenant>`.
2. Ative primeiro `MARKETPLACE_IFOOD_BIDIRECTIONAL_ENABLED=true` e valide filas.
3. Ative `MARKETPLACE_IFOOD_POLLING_FALLBACK_ENABLED=true` somente no staging.
4. Confirme ciclos a cada 30 segundos e presença do merchant.
5. Opcionalmente acione `POST /admin/marketplace/connections/<id>/poll-now?tenantId=<tenant>`; limite 3/min e auditoria obrigatória.

## Cenários obrigatórios

| Cenário | Evidência esperada |
|---|---|
| ciclo vazio | HTTP 204, status `HEALTHY`, timestamps avançam, nenhum ACK |
| pedido novo | evento persistido antes do ACK, pedido único, tenant correto |
| duplicata polling | mesma inbox, `deliveryCount`/`duplicateCount` incrementados, ACK enviado |
| webhook + polling | uma inbox, primeiro/último canal coerentes, nenhum efeito duplicado |
| fora de ordem | evento antigo `IGNORED`; mesmo timestamp usa sequência/precedência |
| desconhecido | persistido `IGNORED`, ACK se houver ID confiável, lote continua |
| persistência indisponível | nenhum ACK; evento reaparece após recuperação |
| ACK indisponível | inbox preservada; retry recebe duplicata e tenta ACK novamente |
| 429 | `Retry-After` respeitado, conexão `DEGRADED`, sem loop agressivo |
| 401/403/merchant divergente | refresh único no 401; falha permanente `BLOCKED`, sem novo polling |
| kill switch | nenhum scan/job novo; webhook continua independente |

Registre apenas correlation ID, tenant, connection, merchant, contagens, status e duração. Não capture Authorization, token, secret, ciphertext, payload integral ou dados pessoais.

## Critérios de go/no-go

Go exige todos os cenários acima, health sem conexão bloqueada, cadência de 30 segundos, ACK pós-persistência comprovado e ausência de duplicação de pedido/efeito. No-go imediato: migration pendente, Redis/BullMQ degradado, presença simultânea, 401/403 persistente, merchant inconsistente, ACK anterior ao commit ou qualquer vazamento de segredo.

## Rollback

1. Defina `MARKETPLACE_IFOOD_POLLING_FALLBACK_ENABLED=false`.
2. Confirme que scans deixaram de criar jobs e aguarde jobs ativos terminarem.
3. Restaure presença webhook do merchant, se esse for o método operacional escolhido.
4. Preserve inbox, conexões, operações, divergências e telemetria para auditoria.
5. Não reverta a migration com `DROP`; remoções exigem proposta destrutiva separada, backup e aprovação.
