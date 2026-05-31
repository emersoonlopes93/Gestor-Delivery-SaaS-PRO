# 🔍 Sumário Executivo - Backend Infrastructure

**Explorado**: `apps/api/src` - Backend NestJS  
**Data**: 31 de Maio de 2026

---

## 📊 Mapa de Infraestrutura

```
┌─────────────────────────────────────────────────────────────┐
│                   APP.MODULE.TS (Global)                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ✅ ThrottlerModule.forRoot()        [ATIVO - NÃO CRÍTICO]   │
│     ├─ default: 120 req/60s                                  │
│     ├─ auth: 10 req/60s                                      │
│     └─ public: 60 req/60s                                    │
│                                                               │
│  ✅ CacheModule.registerAsync()      [ATIVO - RESILIENTE]    │
│     ├─ Redis (com fallback in-memory)                        │
│     ├─ TTL: 60s padrão                                       │
│     └─ Nenhum @Cacheable encontrado                          │
│                                                               │
│  ✅ BullModule.forRoot() [CONDICIONAL]                       │
│     ├─ Env: BULLMQ_ENABLED ou CAMPAIGNS_DISPATCH_ENABLED    │
│     ├─ Connection: Redis                                     │
│     ├─ Attempts: 3 (exponential backoff 5s)                  │
│     └─ removeOnComplete: 1000 jobs                           │
│                                                               │
│  ⚠️  ThrottlerGuard                 [APLICADO GLOBALMENTE]   │
│     └─ Guard em APP_GUARD                                    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 Componentes Identificados

### 1️⃣ BULLMQ - Campaign Dispatch

```
campaigns/services/
├── campaign.processor.ts      [@Processor('campaign-dispatch')]
├── campaign-dispatcher.service.ts  [Alimenta fila a cada 60s]
└── campaigns.service.ts

Flow:
  DB (queued) → feedQueue() → BullMQ → Processor → WhatsApp → DB (sent/failed)
```

**Status**: ✅ Ativo (opcional)  
**Fallback**: ❌ Não  
**Crítico**: ❌ Apenas se CAMPAIGNS_DISPATCH_ENABLED=true

---

### 2️⃣ CACHE - Global Redis com Fallback

```
app.module.ts (CacheModule.registerAsync)
│
└─ Tenta Redis → Se falhar: in-memory {}
   
Uso: InjectableService + CACHE_MANAGER
```

**Status**: ✅ Ativo  
**Fallback**: ✅ Automático in-memory  
**Crítico**: ❌ Não

---

### 3️⃣ THROTTLER - Rate Limiting

```
app.module.ts (ThrottlerGuard em APP_GUARD)
│
Decoradores em:
├── orders.controller.ts           [@Throttle({ public: {...} })]
├── public-orders.controller.ts   [@Throttle({ public: {...} })]
├── customer-auth.controller.ts   [@Throttle({ auth: {...} })]
└── tenant-auth.controller.ts     [@Throttle({ auth: {...} })]
```

**Status**: ✅ Ativo  
**Fallback**: ❌ Não (mas não quebra app)  
**Crítico**: ❌ Proteção, não função

---

### 4️⃣ WEBSOCKET - Chat + Delivery

#### A) Chat Gateway

```
chat/chat.gateway.ts
@WebSocketGateway({ namespace: 'chat', cors: true })

Eventos:
├─ joinTenant()      → client.join(`tenant:${tenantId}`)
├─ joinSession()     → client.join(`session:${sessionId}`)
└─ messageCreated()  → server.to(`tenant:...`).emit()
```

**Segurança**: ✅ JWT obrigatório + ownership check

#### B) Delivery Tracking Gateway

```
delivery/delivery-tracking.gateway.ts
@WebSocketGateway({ namespace: 'delivery', cors: true })

Eventos:
├─ joinTracking()           → client.join(`order:${token}`)
├─ joinTenantTracking()     → client.join(`tenant:${tenantId}`)
└─ updateDriverLocation()   → Persiste em DB + Emit
```

**Segurança**: ⚠️ Simples (apenas log)

---

## 🔗 Áreas Exploradas

| Área | BullMQ | Cache | Throttler | WebSocket | Status |
|------|--------|-------|-----------|-----------|--------|
| campaigns | ✅ | ❌ | ❌ | ❌ | Completo |
| chat | ❌ | ❌ | ❌ | ✅ | Completo |
| delivery | ❌ | ❌ | ❌ | ✅ | Completo |
| orders | ❌ | ❌ | ✅ | ❌ | Completo |
| ai-agent | ❌ | ❌ | ❌ | ❌ | Sem fila |
| notifications | ❌ | ❌ | ❌ | ❌ | Simples |

---

## ⚙️ Variáveis de Ambiente (Todas Opcionais)

```bash
# BullMQ - Filas
BULLMQ_ENABLED=false                      # Habilita BullMQ
CAMPAIGNS_DISPATCH_ENABLED=false          # Habilita Campaign Dispatcher

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=                           # Opcional
REDIS_TLS=false

# Rate Limiting
RATE_LIMIT_TTL_SECONDS=60
RATE_LIMIT_MAX_REQUESTS=120
RATE_LIMIT_AUTH_TTL_SECONDS=60
RATE_LIMIT_AUTH_MAX_REQUESTS=10
RATE_LIMIT_PUBLIC_TTL_SECONDS=60
RATE_LIMIT_PUBLIC_MAX_REQUESTS=60
```

**Nenhuma é obrigatória** ✅

---

## 📈 Fluxos de Dados

### Campaign Dispatch Flow

```
CampaignsController.createCampaign()
  ↓
CampaignsService.createCampaign()
  ├─ Cria Campaign (status: 'pending')
  ├─ Cria N CampaignDispatch (status: 'queued')
  └─ Ativa dispatcher

CampaignDispatcherService.feedQueue() [a cada 60s]
  ├─ Busca campanhas com status 'running'
  ├─ Busca 50 dispatches com status 'queued'
  ├─ Adiciona à fila BullMQ (campaign-dispatch)
  └─ Se vazio → marca campaign como 'completed'

BullMQ Worker (CampaignProcessor)
  ├─ Valida opt-out
  ├─ Personaliza mensagem
  ├─ Envia via WhatsApp
  ├─ Atualiza dispatch (sent/failed)
  └─ Incrementa campaign.totalSent
```

### Chat Gateway Flow

```
Client → JWT Token → handleConnection()
  ├─ Valida JWT
  ├─ Extrai tenantId + userId
  └─ Pronto para subscriptions

Client → joinTenant() + joinSession()
  ├─ client.join(`tenant:${id}`)
  ├─ client.join(`session:${id}`)
  └─ Pronto para receber eventos

ChatGateway.emitMessageCreated()
  ├─ server.to(`tenant:${id}`).emit()
  └─ server.to(`session:${id}`).emit()
```

### Delivery Tracking Flow

```
Driver → updateDriverLocation()
  ├─ Persiste em DB
  └─ Emite via WS

Emissão:
├─ server.to(`tenant:${id}`).emit()  [Mapa do tenant]
└─ server.to(`order:${token}`).emit()  [Rastreamento cliente]
```

---

## 🚨 Riscos e Mitigações

| Risco | Severidade | Mitigação |
|-------|-----------|-----------|
| BullMQ sem fallback | 🟠 Média | Feature flag + monitora fila |
| WebSocket sem fallback | 🟠 Média | Real-time optional + logs |
| Redis indisponível | 🟢 Baixa | Cache fallback in-memory |
| Throttle bypass | 🟢 Baixa | Guard global aplicado |
| @Cacheable não implementado | 🟡 Baixa | Cache está funcional |

---

## ✅ Checklist de Funcionalidade

| Feature | Implementado | Testável | Crítico |
|---------|-------------|----------|---------|
| BullMQ | ✅ | ✅ | ❌ |
| Cache Redis | ✅ | ✅ | ❌ |
| Cache Fallback | ✅ | ✅ | ✅ |
| Throttler | ✅ | ✅ | ❌ |
| Chat WS | ✅ | ✅ | ❌ |
| Delivery WS | ✅ | ✅ | ❌ |
| Campaign Dispatch | ✅ | ✅ | ❌ |
| AI Agent | ✅ | ✅ | ✅ |

---

## 🎓 Conclusões

### Arquitetura: ⭐⭐⭐⭐ (4/5)

✅ Bem estruturada  
✅ Condicional e resiliente  
✅ Sem SPOFs críticos  
⚠️ WebSocket sem fallback (aceitável)

### Infraestrutura: ⭐⭐⭐⭐ (4/5)

✅ BullMQ opcional  
✅ Cache resiliente  
✅ Rate limiting global  
⚠️ Sem cache em método-level

### Documentação: ⭐⭐⭐ (3/5)

⚠️ Poucos comentários explicativos  
⚠️ Sem decisões de design documentadas  
✅ Código legível e seguindo padrões NestJS

---

## 📋 Próximos Passos Recomendados

1. **Monitorar BullMQ**: Adicionar health check e alertas
2. **Implementar @Cacheable**: Em queries pesadas (produtos, categorias)
3. **Testar fallbacks**: Desabilitar Redis em staging
4. **WebSocket fallback**: Considerar polling como fallback em delivery
5. **Load testing**: Testar throttler e cache sob carga

---

**Documento**: BACKEND_INFRASTRUCTURE_AUDIT.md  
**Gerado em**: 31 de Maio de 2026  
**Explorador**: AI Agent v1.0
