# Observability Runbook

## Objetivo

Detectar rapidamente falhas de API, banco, Redis, filas, checkout, webhooks e billing.

## Logs

- A API emite logs estruturados via `StructuredLoggerService` e interceptors HTTP.
- Logs devem ser enviados ao provedor da plataforma (Render ou equivalente) e retidos pelo menos 7 dias.
- Nao registrar tokens, secrets, Authorization headers ou payloads sensiveis.

## Erros

Sentry ou equivalente deve ser configurado antes do primeiro cliente pagante. Na ausencia de Sentry, o provedor de logs precisa ter alertas por padrao de erro.

Eventos minimos:

- Erros 5xx.
- Excecoes nao tratadas.
- Falhas de webhook.
- Falhas de billing cycle/invoice/payment attempt.
- Falhas de checkout.
- Falhas de Redis/BullMQ.

## Alertas

| Alerta | Severidade | Acao |
| --- | --- | --- |
| API 5xx acima do normal | Alta | Ver logs, ultimo deploy e rollback |
| Latencia p95 alta | Media/Alta | Ver DB, Redis, filas e provedor |
| DB indisponivel | Critica | Congelar deploy, acionar backup/restore se necessario |
| Redis indisponivel | Alta | Ver filas/cache; pausar campanhas |
| Fila acumulada | Alta | Reprocessar ou pausar produtor |
| Webhook falhando | Alta | Validar HMAC, replay window, provider |
| Billing cycle falhando | Alta | Bloquear cobranca automatica e investigar |
| Checkout falhando | Critica | Rollback ou mitigacao imediata |

## Dashboard Basico

Deve conter:

- `/api/v1/health`.
- `/api/v1/admin/health/system`.
- status DB, Redis, BullMQ, storage driver e billing config.
- taxa de 5xx.
- latencia p95.
- volume de checkout.
- volume e erro de webhook.

## Incidente

1. Classificar severidade.
2. Congelar deploys se a falha for regressao.
3. Coletar logs por `requestId`.
4. Checar health e ultimo deploy.
5. Aplicar rollback se houver impacto em checkout, auth ou billing.
6. Registrar linha do tempo.
7. Rodar checklist pos-incidente.

## Pos-Incidente

- [ ] Causa raiz documentada.
- [ ] Dados afetados avaliados.
- [ ] Clientes impactados mapeados.
- [ ] Correcao testada em staging.
- [ ] Gate de release atualizado se necessario.

## Evidencia Operacional Atual

Ultima verificacao: 2026-06-10.

| Item | Status |
| --- | --- |
| Logs centralizados | Render logs disponiveis para API staging |
| Sentry/equivalente | Pendente |
| Alerta 5xx | Pendente |
| Alerta latencia alta | Pendente |
| Alerta DB indisponivel | Pendente |
| Alerta Redis indisponivel | Pendente |
| Alerta fila acumulada | Pendente |
| Alerta webhook falhando | Pendente |
| Alerta billing cycle falhando | Pendente |
| Alerta checkout falhando | Pendente |
| Canal de alerta | Pendente |
| Teste de alerta | Pendente |

Resultado atual: NO-GO ate ferramenta/canal/alertas serem configurados e testados.
