# Queues Runbook

## Escopo

Redis e BullMQ sao obrigatorios em producao para filas, jobs assincronos e campanhas.

## Configuracao Obrigatoria

- `REDIS_ENABLED=true`.
- `REDIS_HOST` remoto; proibido `localhost` ou `127.0.0.1`.
- `REDIS_TLS=true` quando exigido pelo provedor.
- `BULLMQ_ENABLED=true`.
- `CAMPAIGNS_DISPATCH_ENABLED=true` apenas quando campanhas estiverem operacionalmente liberadas.

## Filas E Jobs Atuais

- Campaign dispatch: modulo `campaigns`, processadores de campanhas e recuperacao.
- Jobs futuros criticos devem usar BullMQ com retry e idempotencia.
- Cache Redis e health devem refletir indisponibilidade.

## Retry Policy Padrao

Configurada em `apps/api/src/app.module.ts`:

- `attempts: 3`.
- backoff exponencial com `delay: 5000`.
- `removeOnComplete: 1000`.
- `removeOnFail: 5000`.

## Identificar Falhas

1. Verificar admin health.
2. Verificar logs por `BullMQ`, `campaign`, `job failed`, `redis_connection_failed`.
3. Consultar painel do provedor Redis para conexoes, memoria e latencia.
4. Se houver painel BullMQ externo, revisar jobs failed/delayed/waiting.

## Reprocessar Falhas

- Reprocessar somente jobs idempotentes.
- Antes de retry em massa, confirmar que a causa raiz foi corrigida.
- Para campanhas, pausar disparos antes de retry se houver risco de duplicidade.
- Registrar IDs de jobs reprocessados no incidente.

## Fila Travada

Sinais:

- `waiting` ou `delayed` cresce continuamente.
- Nenhum job completado por mais de 10 minutos.
- Redis health degradado.
- Latencia de checkout/admin aumenta por dependencia indireta.

Acao:

1. Pausar campanhas se estiverem causando acumulacao.
2. Validar Redis.
3. Reiniciar worker/API se necessario.
4. Reprocessar jobs falhos em lotes pequenos.
5. Abrir incidente se afetar pedidos, billing ou comunicacao com cliente.

## Alertas Minimos

- Redis indisponivel.
- BullMQ sem processamento.
- Jobs failed acima do limiar.
- Fila waiting/delayed crescendo.
- Campanha com falhas repetidas.
