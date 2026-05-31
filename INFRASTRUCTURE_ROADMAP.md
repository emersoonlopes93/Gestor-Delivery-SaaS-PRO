# 🗺️ Roadmap & Matriz de Decisão

## 1. Matriz de Decisão - Por Use Case

### Você precisa processar algo em background?

```
┌─ Precisa de persistência?
│  ├─ SIM → Use BullMQ + Redis
│  │  └─ Habilite: BULLMQ_ENABLED=true + CAMPAIGNS_DISPATCH_ENABLED=true
│  │
│  └─ NÃO → Use SetTimeout/setTimeout()
│     └─ Para: Notificações simples, sync checks
│
├─ Precisa de retry automático?
│  └─ SIM → Configure em defaultJobOptions (attempts, backoff)
│
├─ Precisa de escalabilidade horizontal?
│  └─ SIM → Use BullMQ + Redis (suporta múltiplos workers)
│
└─ Vai usar em produção com muita carga?
   └─ SIM → Obrigatório BullMQ
```

---

### Você precisa cachear dados?

```
┌─ Quanto tempo valid a cache?
│  ├─ < 1 minuto → Use Cache in-memory (DEFAULT)
│  ├─ 1-60 minutos → Use Redis com fallback in-memory
│  └─ > 1 hora → Considere Redis só
│
├─ Dados são críticos (precisa 100% acurácia)?
│  ├─ SIM → Não cache, ou cache com validação
│  └─ NÃO → Cache com TTL generoso
│
├─ Quantos dados vai cachear?
│  ├─ < 1MB → in-memory é OK
│  ├─ 1-100MB → use Redis
│  └─ > 100MB → considere arquitetura diferente
│
└─ Precisa invalidar manualmente?
   ├─ SIM → Implemente @CacheEvict ou cache.del()
   └─ NÃO → Use TTL apenas
```

---

### Você precisa limitar requisições?

```
┌─ Qual é o padrão de uso?
│  ├─ Pública → RATE_LIMIT_PUBLIC_MAX_REQUESTS = 60/min
│  ├─ Autenticada → RATE_LIMIT_AUTH_MAX_REQUESTS = 10/min
│  └─ Administrativa → RATE_LIMIT_MAX_REQUESTS = 120/min
│
├─ Precisa de bypass para alguns usuários?
│  ├─ SIM → Implemente SkipThrottle() + guard customizado
│  └─ NÃO → Use decorator @Throttle()
│
└─ Qual a key do limite?
   ├─ Por IP (default) → Deixe keyGenerator padrão
   ├─ Por User → Customize keyGenerator
   └─ Por API Key → Customize keyGenerator
```

---

### Você precisa de real-time?

```
┌─ Qual é a natureza do dado?
│  ├─ Notificações simples → Considere polling (REST)
│  ├─ Atualizações frequentes → Use WebSocket
│  └─ Dados críticos → Use WebSocket + fallback polling
│
├─ Vai ter muitas conexões?
│  ├─ < 100 → WebSocket é OK
│  ├─ 100-10k → Use adapter de Redis (Redis Adapter)
│  └─ > 10k → Considere arquitetura de pub/sub
│
├─ Precisa de autenticação?
│  ├─ SIM → Valide JWT em handleConnection()
│  └─ NÃO → Apenas log básico
│
└─ Qual é o custo de desconexão?
   ├─ Alto → Implemente reconnect + buffer de mensagens
   └─ Baixo → OK deixar as mensagens no broadcast
```

---

## 2. Roadmap de Melhorias

### 🟢 Imediato (1-2 semanas)

- [ ] **Adicionar health check para BullMQ**
  - Endpoint `/health/bullmq` que verifica connection
  - Monitora tamanho da fila
  - Alerta se muitos jobs falhados
  
- [ ] **Implementar @Cacheable em queries críticas**
  - `getAllCategories()` - 5min TTL
  - `getProductById()` - 10min TTL
  - `getTenantSettings()` - 15min TTL

- [ ] **Adicionar logs estruturados para WebSocket**
  - Connection/disconnection events
  - Message flow trace
  - Performance metrics

- [ ] **Testar fallbacks em staging**
  - Desabilitar Redis em staging
  - Rodar campanhas sem BullMQ
  - Verificar WebSocket sem servidor central

---

### 🟡 Curto Prazo (1 mês)

- [ ] **Implementar Redis Adapter para Socket.io**
  - Permite múltiplos servers compartilharem conexões
  - Necessário para arquitetura de múltiplas instâncias
  
  ```typescript
  // No chat.gateway.ts
  import { createAdapter } from '@socket.io/redis-adapter';
  
  @WebSocketGateway({
    adapter: createAdapter(redis, redisClient),
  })
  ```

- [ ] **Adicionar observabilidade**
  - Prometheus metrics para BullMQ
  - OpenTelemetry traces para WebSocket
  - Dashboard Grafana para infra

- [ ] **Implementar cache invalidation strategy**
  - Event-based invalidation
  - Pattern-based cleanup
  - Documento de invalidation rules

- [ ] **Criar CLI commands para operações**
  - `npm run bullmq:retry` - Retry failed jobs
  - `npm run cache:flush` - Limpar cache
  - `npm run websocket:stats` - Ver conexões ativas

---

### 🟠 Médio Prazo (2-3 meses)

- [ ] **Implementar circuit breaker**
  - Para falhas de Redis
  - Para falhas de WhatsApp
  - Com fallback em-memory

- [ ] **Adicionar rate limiting por tenant**
  - Isolamento de quotas
  - Considerar tier/plan do tenant

- [ ] **Implementar backpressure**
  - Limitar tamanho da fila
  - Rejeitar novos jobs se > threshold

- [ ] **Documentar SLAs**
  - Campaign delivery SLA
  - Cache hit rate SLA
  - WebSocket latency SLA

---

### 🔴 Longo Prazo (3-6 meses)

- [ ] **Considerar mudança de arquitetura para eventos**
  - Event sourcing para campanhas
  - Event-driven cache invalidation
  - Real-time analytics via eventos

- [ ] **Implementar auto-scaling**
  - Escalabilidade horizontal de workers
  - Adaptive rate limiting baseado em carga

- [ ] **Multi-region deployment**
  - Redis replication
  - WebSocket de múltiplas regiões
  - Geo-routing

---

## 3. Matriz de Impacto vs Esforço

```
                    IMPACTO ALTO
                        ↑
                        |
                 ⭐ Health Check   ⭐ Observability
                        |            (Prom/Otel)
                        |
    Cache Invalidation ⭐|           ⭐ Redis Adapter
        Rules           |          (Multi-instance)
                        |
    ──────────────────┼────────────────── ESFORÇO
                        |
                        |          ⭐ Circuit Breaker
                 ⭐ CLI Ops          (Redis failover)
                        |
                        |
                    IMPACTO BAIXO


⭐ = Recomendado próximos passos
```

---

## 4. Matriz de Risco x Complexidade

| Feature | Risco | Complexidade | Status | Prioridade |
|---------|-------|-------------|--------|-----------|
| BullMQ | 🟠 Médio | 🟡 Média | ✅ Ativo | 🔴 Alta |
| Cache Redis | 🟢 Baixo | 🟢 Baixa | ✅ Ativo | 🟡 Média |
| Throttler | 🟢 Baixo | 🟢 Baixa | ✅ Ativo | 🟢 Baixa |
| Chat WS | 🟡 Médio | 🟡 Média | ✅ Ativo | 🟡 Média |
| Delivery WS | 🟡 Médio | 🟡 Média | ✅ Ativo | 🔴 Alta |
| Health Check | 🟢 Baixo | 🟢 Baixa | ❌ TODO | 🔴 Alta |
| @Cacheable | 🟢 Baixo | 🟢 Baixa | ❌ TODO | 🟡 Média |
| Observability | 🟠 Médio | 🟠 Alto | ❌ TODO | 🟡 Média |
| Circuit Breaker | 🟠 Médio | 🟠 Alto | ❌ TODO | 🟢 Baixa |

---

## 5. Decisões de Design

### 5.1 Por que BullMQ é opcional?

✅ **Vantagens**:
- Não quebra app se Redis cai
- Permite desenvolvimento local sem Docker
- Graduação de funcionalidades

❌ **Desvantagens**:
- Sem persistência se desabilitado
- Campanhas não funcionam sem fila

**Decisão**: Manter como é (condicional)

---

### 5.2 Por que Cache tem fallback in-memory?

✅ **Vantagens**:
- Desenvolvimento local simples
- Resiliente a falhas de Redis
- Performance aceitável em-memory

❌ **Desvantagens**:
- Não compartilhado entre servidores
- Vaza memória em longa execução

**Decisão**: Manter como é (melhorar com limpeza)

---

### 5.3 Por que Throttler é global?

✅ **Vantagens**:
- Proteção por padrão
- Impossível de esquecer
- Simples de customizar

❌ **Desvantagens**:
- Pode ser resto apertado
- Decorador override necessário em alguns endpoints

**Decisão**: Manter como é (considerar rate limiting por tenant)

---

### 5.4 Por que WebSocket sem fallback?

✅ **Vantagens**:
- Simples implementação
- Performance otimizada
- Sem complexidade de fallback

❌ **Desvantagens**:
- Falha em conexões instáveis
- Perde mensagens em desconexão

**Decisão**: Considerar polling como fallback em produção

---

## 6. Checklist de Production Readiness

### 6.1 BullMQ Production

- [ ] Redis com replicação (master-slave ou cluster)
- [ ] Health check endpoint
- [ ] Monitoring de failed jobs
- [ ] Alertas para fila > X jobs
- [ ] Retry policy documentada
- [ ] Max attempts = 3 (ajustável)
- [ ] Backoff exponencial configurado
- [ ] Testes de failover

### 6.2 Cache Production

- [ ] Redis com persistência (RDB ou AOF)
- [ ] Cache hit rate > 70%
- [ ] TTL strategy documentada
- [ ] @Cacheable em queries críticas
- [ ] Invalidation events configurados
- [ ] Memory usage monitorado

### 6.3 Throttler Production

- [ ] Rate limits por endpoint testados
- [ ] Keys: IP ou User ID (não ambos)
- [ ] Alertas para rate limit violations
- [ ] Skip throttle apenas em health checks
- [ ] Documentação de limites públicos

### 6.4 WebSocket Production

- [ ] Redis adapter para múltiplos servers
- [ ] Connection pool monitorado
- [ ] Graceful shutdown implementado
- [ ] Logs estruturados
- [ ] Teste de desconexão/reconexão
- [ ] Fallback para polling (opcional)

---

## 7. Exemplo: Plano de Escalabilidade

### Fase 1: Desenvolvimento Local

```yaml
Services:
  - API (single instance)
  - Redis (local container)
  - DB (local)
  
Config:
  BULLMQ_ENABLED: true
  REDIS_HOST: localhost
  Cache: Redis + in-memory fallback
```

### Fase 2: Staging Environment

```yaml
Services:
  - API (2 instances)
  - Redis (single instance, persistence)
  - DB (single instance)
  
Config:
  BULLMQ_ENABLED: true
  REDIS_HOST: redis-staging
  Cache: Redis only
  WebSocket: Redis adapter
```

### Fase 3: Production Environment

```yaml
Services:
  - API (N instances, auto-scaling)
  - Redis Cluster (3+ nodes)
  - Redis Sentinel (failover)
  - DB (replicated)
  - Queue Monitor (Bull UI opcional)
  
Config:
  BULLMQ_ENABLED: true
  REDIS_HOST: redis-cluster-endpoint
  Cache: Redis with circuit breaker
  WebSocket: Redis adapter + Nginx load balance
  Observability: Prometheus + Grafana
```

---

## 8. Decision Log

| Data | Componente | Decisão | Razão | Owner |
|------|-----------|---------|-------|-------|
| 2026-05-31 | BullMQ | Manter condicional | Não quebra app | Arquitetura |
| 2026-05-31 | Cache | Fallback in-memory | Resiliente | Arquitetura |
| 2026-05-31 | Throttler | Global + Guard | Proteção padrão | Segurança |
| 2026-05-31 | WebSocket | Sem fallback | Simples produção | Performance |

---

## 9. Métricas & KPIs

### 9.1 BullMQ

```
- Jobs completados / minuto
- Taxa de sucesso (%)
- P99 latência (ms)
- Taxa de retry (%)
- Tamanho da fila (jobs)
```

### 9.2 Cache

```
- Hit rate (%)
- Miss rate (%)
- Memory usage (MB)
- Avg TTL (s)
- Invalidation events / h
```

### 9.3 Throttler

```
- Rate limit hits (%)
- Top throttled endpoints
- Taxa por IP/User
- Alert count
```

### 9.4 WebSocket

```
- Conexões ativas
- Messages/segundo
- P99 latência (ms)
- Desconexões/hora
- Throughput (MB/s)
```

---

**Documento**: INFRASTRUCTURE_ROADMAP.md  
**Versão**: 1.0  
**Última atualização**: 31 de Maio de 2026  
**Próxima revisão**: 30 de Junho de 2026
