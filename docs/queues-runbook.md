# Queues Runbook

## Escopo

Redis e BullMQ sustentam cache, health operacional e filas assincronas. Em producao controlada, Redis real e BullMQ saudavel sao obrigatorios. Free-tier instavel ou sem cota adequada e `NO-GO`.

## Auditoria Atual De Redis

| Uso | Critico? | Pode rodar sem Redis? | Comportamento atual | Comportamento desejado |
| --- | --- | --- | --- | --- |
| Cache global Nest `CacheModule` | Opcional em producao | Sim, com memoria local e menor eficiencia | Tenta Redis e cai para memoria | Redis ativo em producao; fallback apenas dev/staging |
| Rate limit `ThrottlerModule` | Obrigatorio como controle, Redis opcional no codigo atual | Sim, usa memoria do processo | Nao usa Redis diretamente | Em producao multi-instancia, usar storage compartilhado ou aceitar limite por instancia documentado |
| Health publico/admin | Obrigatorio | Sim para responder, mas deve marcar degradado | Mostra Redis/BullMQ no health | Degradado com `productionReady=false` e motivo claro |
| BullMQ base connection | Obrigatorio se jobs criticos ativos | Nao para jobs criticos | So inicializa se Redis/BullMQ/campanhas habilitados | Falhar gate em producao se Redis ou BullMQ off |
| Campaign dispatch | Deve ficar desligado no piloto salvo liberacao operacional | Sim, campanhas ficam sem dispatcher | Dispatcher/processor nao registram se Redis desabilitado | Campanhas off no piloto; ligar somente com Redis pago e monitorado |
| Storefront/cache/catalog/upload/tenant readiness | Opcional em producao | Sim | Leitura/escrita em cache usam fallback do cache manager | Redis saudavel para reduzir custo/latencia; sem falha funcional se cair |
| Billing jobs | Obrigatorio se forem introduzidos como fila critica | Hoje nao ha BullMQ real para billing | Billing smoke HTTP roda sem fila | Modo manual/HTTP explicito se fila off; nao fingir job processado |
| Webhooks | Obrigatorio por HTTP, fila nao usada hoje | Sim | Persistencia/idempotencia por DB | Se virar job assincrono, fila vira critica e bloqueia GO |
| Sessoes | Nao usa Redis hoje | Sim | Sessao/token via DB/JWT | Se Redis entrar para sessoes, vira obrigatorio e precisa de smoke proprio |

Classificacao:

- Obrigatorio em producao: Redis real, BullMQ real se qualquer job critico estiver ativo, health com `productionReady=true`.
- Opcional em producao: cache de leitura e cache agressivo.
- Apenas staging/dev: Redis desligado por custo/cota com health `degraded`.
- Deve ficar desligado no piloto: campanhas em massa ate existir cota, alerta e operador responsavel.

## Auditoria Atual De BullMQ

| Fila/job | Critico? | Pode rodar sem BullMQ? | Comportamento atual | Comportamento desejado |
| --- | --- | --- | --- | --- |
| `campaign-dispatch` | Nao no piloto | Sim, campanhas ficam sem dispatch automatico | Registrada apenas com `CAMPAIGNS_DISPATCH_ENABLED=true` e Redis habilitado | Manter off no piloto; ligar somente com Redis validado |
| Smoke `queues-smoke-*` | Operacional | Nao aplicavel | Criado apenas pelo script de smoke | Enfileira, processa, falha controlada e limpa a fila |
| Billing async | Potencialmente critico futuro | Hoje sim, porque fluxo e HTTP/manual | Nao ha fila de billing registrada | Se existir, `BULLMQ_ENABLED=false` deve bloquear ou exigir modo manual explicito |

## Politica Por Ambiente

### Development

- Redis pode ser opcional.
- `REDIS_ENABLED=false` e aceitavel.
- Logs devem ser `warn` controlado, sem spam a cada request.
- Redis local so deve ser usado para desenvolvimento.

### Staging

- Redis preferencialmente ativo.
- Se Redis/BullMQ forem desligados por custo ou cota, `/health` deve ficar `degraded`.
- Smokes estritos devem retornar `NO-GO`.
- Smokes relaxed podem retornar `PRODUCTION_INFRA_SMOKE_GO` com `result=GO parcial`, `productionReady=false` e motivo explicito.

### Production

- `REDIS_ENABLED=true` obrigatorio.
- `REDIS_HOST` remoto obrigatorio; proibido `localhost` e `127.0.0.1`.
- `BULLMQ_ENABLED=true` obrigatorio quando houver jobs criticos.
- API/gate deve falhar startup ou release se Redis nao conecta, BullMQ esta off, ou filas criticas estao degradadas.

## Protecao Contra Ruido De Log

O startup/cache Redis aplica:

- throttling de logs repetidos por chave;
- reconexao com backoff exponencial;
- circuito simples apos limite de tentativas;
- classificacao de erro: `quota_or_rate_limit`, `authentication`, `network_or_timeout`, `unavailable`, `unknown`;
- health consolidado com `productionReady=false` e motivos.

Estados esperados:

- Redis disabled intencionalmente: warn unico e health `degraded`.
- Redis enabled mas indisponivel: warn controlado e fallback de cache em memoria.
- Quota/rate limit: classificado como `quota_or_rate_limit`; acao e trocar/plano/cota.
- Auth invalida: classificado como `authentication`; acao e corrigir secret/env.

## Health De Filas

`/api/v1/health` expoe:

- `services.redis`;
- `services.bullmq`;
- `checks.redis`;
- `checks.bullmq`;
- `queues`;
- `productionReady`;
- `productionReadiness.reasons`.

Sem Redis/BullMQ:

- `services.bullmq=disabled`;
- `productionReady=false`;
- motivo claro em `productionReadiness.reasons`.

Contagens `waiting`, `active`, `failed` e `delayed` ficam `null` quando a API nao tem conexao BullMQ saudavel. O smoke de filas valida contagens reais em uma fila segura isolada.

## Configuracao Obrigatoria

- `REDIS_ENABLED=true`.
- `REDIS_HOST` remoto.
- `REDIS_TLS=true` quando exigido pelo provedor.
- `REDIS_PASSWORD` configurado quando exigido.
- `BULLMQ_ENABLED=true`.
- `CAMPAIGNS_DISPATCH_ENABLED=false` no piloto, salvo liberacao operacional.

## Tamanho Inicial Recomendado

- Piloto controlado: instancia pequena paga, com SLA/cota previsivel.
- Nao depender de free-tier para producao.
- Separar Redis de dev, staging e producao.
- Nunca compartilhar Redis de producao com teste.
- Campanhas desativadas inicialmente.
- Cache agressivo opcional.
- Jobs criticos apenas.
- Monitorar uso diariamente na primeira semana.
- Definir alerta de consumo/cota antes do primeiro cliente real.

## Smoke De Filas

Comando:

```bash
pnpm --filter @gestor/api smoke:queues
```

Fluxo:

1. Valida env Redis e BullMQ.
2. Conecta no Redis.
3. Executa `PING`.
4. Cria fila `queues-smoke-*`.
5. Enfileira e processa job de sucesso.
6. Simula falha controlada.
7. Confirma `failed`.
8. Le contagens da fila.
9. Limpa a fila.

Marcadores:

- `QUEUES_SMOKE_GO`
- `QUEUES_SMOKE_NO_GO`

## Evidencia Operacional Atual

Ultima verificacao: 2026-06-10 21:11 BRT.

| Item | Status | Evidencia | Responsavel | Data/hora |
| --- | --- | --- | --- | --- |
| Redis configurado | validated / risk pending | Provider inferido por host: Upstash; porta `6379`; TLS `true`; senha configurada; plano/cota nao evidenciados pelo painel | Operacao | 2026-06-10 21:11 BRT |
| BullMQ configurado | validated | `BULLMQ_ENABLED=true`; `CAMPAIGNS_DISPATCH_ENABLED=false`; health `bullmq=ok` | Operacao | 2026-06-10 21:11 BRT |
| Ultimo smoke de filas | validated | `QUEUES_SMOKE_GO`; ping Redis ok; job processado; falha controlada registrada; fila smoke limpa | Operacao | 2026-06-10 21:11 BRT |
| Ultimo health Redis | validated | `/api/v1/health`: Redis `ok`, `connected=true`, cache `redis` | Operacao | 2026-06-10 21:11 BRT |
| Ultimo health BullMQ | validated | `/api/v1/health`: BullMQ `ok`, `enabled=true`, `connected=true` | Operacao | 2026-06-10 21:11 BRT |

Resultado atual do gate Redis/BullMQ: GO parcial.

Risco pendente: plano/cota do Redis Upstash nao foi comprovado no painel. Se for free-tier, e aceitavel apenas para staging ou piloto muito controlado com contingencia; continua NO-GO para producao controlada ampla.

## Queda De Redis

1. Confirmar health publico e admin.
2. Validar status/cota do provedor Redis.
3. Pausar campanhas e produtores de jobs nao criticos.
4. Se o provedor estiver verde, reiniciar API/worker.
5. Reprocessar jobs falhos em lotes pequenos e idempotentes.
6. Abrir incidente se afetar checkout, billing ou comunicacao.

## Regras De NO-GO

- Redis/BullMQ disabled em producao.
- Redis em free-tier sem cota/garantia adequada.
- Redis degradado no smoke estrito.
- BullMQ degradado no smoke estrito.
- Filas criticas sem fallback manual documentado.
