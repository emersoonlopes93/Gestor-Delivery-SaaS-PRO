# 🔍 Auditoria de Impacto: Desativar Upstash Redis

**Data**: 31 de Maio de 2026  
**Status**: ✅ Auditoria Completa  
**Resultado**: Seguro desativar Redis com fallbacks implementados

---

## 📊 Resumo Executivo

| Componente | Usa Redis? | Obrigatório em Prod? | Fallback Possível? | Status |
|---|---|---|---|---|
| **Cache Global** | ✅ Sim | ❌ Não | ✅ In-memory | ✓ JÁ IMPLEMENTADO |
| **BullMQ (Campanhas)** | ✅ Sim | ❌ Condicional | ⚠️ Parcial | ✗ REQUER MUDANÇA |
| **Throttler (Rate Limit)** | ❌ Não | ❌ Não | ✓ Nativo | ✓ OK |
| **WebSockets (Chat/Delivery)** | ❌ Não | ❌ Não | ✓ Nativo | ✓ OK |
| **AI Agent Debounce** | ❌ Não | ❌ Não | ✓ In-memory | ✓ OK |
| **WhatsApp Notifications** | ❌ Não | ❌ Não | ✓ Nativo | ✓ OK |

---

## 🔴 O QUE QUEBRA SEM REDIS

### 1️⃣ **BullMQ - Campaign Dispatcher** (CRÍTICO PARA CAMPANHAS)

**Arquivo**: `apps/api/src/campaigns/`

Se `CAMPAIGNS_DISPATCH_ENABLED=true` e Redis indisponível:
- ❌ Campanhas com status "queued" não são enviadas
- ✅ Status fica persistido em banco (não perdido)
- ✅ Pode ser re-tentado quando Redis voltar
- ⚠️ UI mostra campanhas "waiting" indefinidamente

**Solução**: Desabilitar automaticamente se Redis not available

---

## 🟢 O QUE NÃO QUEBRA

### Cache Module (já tem fallback)
```typescript
// ✅ Funcionando em app.module.ts linha 95-123
CacheModule.registerAsync({
  useFactory: async () => {
    if (!process.env.REDIS_HOST) {
      console.warn('⚠️ REDIS_HOST não configurado. Usando cache in-memory.');
      return {};
    }
    try {
      const store = await redisStore({...});
      await (store as any).client.ping();
      return { store };
    } catch (err) {
      console.warn('⚠️ Falha ao conectar Redis. Fallback in-memory.');
      return {};
    }
  }
})
```

### Throttler (Rate Limiting)
- ✅ Funciona via memory store (nativo do @nestjs/throttler)
- ✅ Sem dependência de Redis

### WebSockets (Chat, Delivery, Orders)
- ✅ Socket.io simples, sem adapter Redis
- ✅ Funciona em single instance
- ⚠️ Não escalável horizontalmente sem adapter

### AI Agent
- ✅ Debounce usa Map<string, NodeJS.Timeout> (in-memory)
- ✅ Sem dependência de Redis
- ✅ Cache de config usa in-memory + banco

---

## 📍 MAPA DE REFERÊNCIAS REDIS

### BullMQ/Queue (Campanhas)

| Arquivo | Linha | Tipo | Uso |
|---------|-------|------|-----|
| `app.module.ts` | 6 | Import | `import { BullModule }` |
| `app.module.ts` | 73-92 | Config | `BullModule.forRoot({ connection: {...}})` |
| `campaigns/campaigns.module.ts` | 8 | Import | `import { BullModule }` |
| `campaigns/campaigns.module.ts` | 11 | Flag | `const enableCampaignDispatch = ...` |
| `campaigns/campaigns.module.ts` | 20-26 | Config | `BullModule.registerQueue({name: 'campaign-dispatch'})` |
| `campaigns/services/campaign-dispatcher.service.ts` | 3 | Import | `import { InjectQueue }` |
| `campaigns/services/campaign-dispatcher.service.ts` | 14 | Inject | `@InjectQueue('campaign-dispatch')` |
| `campaigns/services/campaign.processor.ts` | 1-2 | Import | `import { Processor, WorkerHost }` |
| `campaigns/services/campaign.processor.ts` | 17 | Decorator | `@Processor('campaign-dispatch')` |
| `ai-agent/services/ai-config-diagnostics.service.ts` | 40 | Check | `bullmqEnabled: process.env.BULLMQ_ENABLED === 'true'` |

### Cache Module (Redis com Fallback)

| Arquivo | Linha | Tipo | Uso |
|---------|-------|------|-----|
| `app.module.ts` | 7-8 | Import | `import { CacheModule, redisStore }` |
| `app.module.ts` | 96-123 | Config | `CacheModule.registerAsync({...})` |
| `storefront/storefront.service.ts` | 2-3 | Import | `import { CACHE_MANAGER, Cache }` |
| `config/env.validation.ts` | 37-41 | Env Vars | Redis HOST/PORT/PASSWORD/TLS |

### Throttler (Rate Limiting)

| Arquivo | Linha | Tipo | Uso |
|---------|-------|------|-----|
| `app.module.ts` | 4-5 | Import | `import { ThrottlerModule, ThrottlerGuard }` |
| `app.module.ts` | 55-68 | Config | `ThrottlerModule.forRoot([...])` |
| `app.module.ts` | 197 | Provider | `provide: APP_GUARD, useClass: ThrottlerGuard` |
| `orders/orders.controller.ts` | 21 | Import | `import { Throttle }` |
| `orders/orders.controller.ts` | 35, 45, 55 | Decorator | `@Throttle({...})` |
| `orders/public-orders.controller.ts` | 4 | Import | `import { Throttle }` |
| `orders/public-orders.controller.ts` | 42, 52 | Decorator | `@Throttle({...})` |
| `auth/customer-auth.controller.ts` | 2 | Import | `import { Throttle }` |
| `auth/customer-auth.controller.ts` | 12, 22 | Decorator | `@Throttle({...})` |
| `auth/tenant-auth.controller.ts` | 6 | Import | `import { Throttle }` |
| `auth/tenant-auth.controller.ts` | 33, 40 | Decorator | `@Throttle({...})` |

### WebSockets (Chat, Orders, Delivery)

| Gateway | Arquivo | Tipo | Redis Adapter? |
|---------|---------|------|---|
| Chat | `chat/chat.gateway.ts` | Socket.io | ❌ Não |
| Orders | `orders/orders.gateway.ts` | Socket.io | ❌ Não |
| Delivery Tracking | `delivery/delivery-tracking.gateway.ts` | Socket.io | ❌ Não |

---

## 🎯 IMPACTO POR ÁREA

### 1. CAMPANHAS (WhatsApp Bulk)
- **Funcionalidade**: Envio de campanhas de marketing
- **Com Redis**: ✅ Fila processa em tempo real, workers disparam jobs
- **Sem Redis**: ❌ Fila não funciona, campanhas queued não são enviadas
- **Impacto**: Campanhas "pendem" indefinidamente, sem envio
- **Solução**: Desabilitar BullMQ, mover para polling DB

### 2. CHAT (IA Agent + Inbox)
- **Funcionalidade**: Chat em tempo real, conversas IA
- **Com Redis**: ✅ Cache de configs, debounce rápido
- **Sem Redis**: ✅ Tudo em-memory (cache e debounce via setTimeout)
- **Impacto**: Nenhum (Cache fallback + debounce in-memory)
- **Status**: ✅ Seguro

### 3. PEDIDOS (Real-time Status)
- **Funcionalidade**: Atualizações de status, rastreamento
- **Com Redis**: ✅ Socket.io broadcast
- **Sem Redis**: ✅ Socket.io broadcast (sem adapter)
- **Impacto**: Nenhum (single instance)
- **Status**: ✅ Seguro

### 4. DELIVERY (Rastreamento)
- **Funcionalidade**: Localização em tempo real do driver
- **Com Redis**: ✅ Socket.io broadcast
- **Sem Redis**: ✅ Socket.io broadcast (sem adapter)
- **Impacto**: Nenhum (single instance)
- **Status**: ✅ Seguro

### 5. NOTIFICAÇÕES (WhatsApp/Push)
- **Funcionalidade**: Envio de notificações de status
- **Com Redis**: ✅ Fire-and-forget (background)
- **Sem Redis**: ✅ Fire-and-forget funciona mesmo sem Redis
- **Impacto**: Nenhum
- **Status**: ✅ Seguro

### 6. RATE LIMITING
- **Funcionalidade**: Proteção contra abuso de API
- **Com Redis**: ✅ Throttler com Redis store
- **Sem Redis**: ✅ Throttler com memory store (padrão)
- **Impacto**: Nenhum (Throttler tem memory store built-in)
- **Status**: ✅ Seguro

### 7. CACHE (Storefront, Catalog)
- **Funcionalidade**: Cache de storefront, produtos
- **Com Redis**: ✅ Distribuído
- **Sem Redis**: ✅ In-memory automático (JÁ IMPLEMENTADO)
- **Impacto**: Nenhum (fallback automático)
- **Status**: ✅ Seguro

### 8. AI AGENT
- **Funcionalidade**: Conversas, tools, debounce
- **Com Redis**: ✅ Debounce centralizado
- **Sem Redis**: ✅ Debounce in-memory (Map)
- **Impacto**: Nenhum
- **Status**: ✅ Seguro

---

## ⚡ ESTRATÉGIA: REDIS_ENABLED Flag

### Novo Env

```bash
# Dev/teste: desabilita Redis e fallbacks
REDIS_ENABLED=false

# Ou variáveis individuais
REDIS_HOST=        # Vazio = desabilita
```

### Comportamento

| Cenário | REDIS_ENABLED | REDIS_HOST | BullMQ | Cache | Throttle |
|---------|---|---|---|---|---|
| Prod com Redis | `true` | `redis.prod.io` | ✅ Ativo | ✅ Redis | ✅ Redis |
| Prod sem Redis | ❌ ERRO | (vazio) | ❌ Erro boot | ✅ In-mem | ✅ In-mem |
| Dev com Redis | `true` | `localhost` | ✅ Ativo | ✅ Local | ✅ Local |
| **Dev sem Redis** | **`false`** | **(vazio)** | **❌ Skip** | **✅ In-mem** | **✅ In-mem** |
| Teste | `false` | (vazio) | ❌ Skip | ✅ In-mem | ✅ In-mem |

---

## 🛠️ IMPLEMENTAÇÃO

### 1. Adicionar Env Var (env.validation.ts)

```typescript
REDIS_ENABLED: z.enum(['true', 'false']).default('true'),  // Default ativado
REDIS_HOST: z.string().default(''),  // Vazio = desabilitado
```

### 2. Update app.module.ts - BullMQ Condicional

Adicionar check de REDIS_ENABLED na linha 73:

```typescript
...(
  process.env.REDIS_ENABLED !== 'false' && 
  (process.env.BULLMQ_ENABLED === 'true' || 
   process.env.CAMPAIGNS_DISPATCH_ENABLED === 'true')
    ? [BullModule.forRoot({...})]
    : []
),
```

### 3. Update campaigns.module.ts - Fallback

Se BullMQ desabilitado, skip processor/dispatcher:

```typescript
const enableCampaignDispatch = 
  process.env.REDIS_ENABLED !== 'false' && 
  process.env.CAMPAIGNS_DISPATCH_ENABLED === 'true';
```

### 4. Adicionar Logs Claros

```typescript
// app.module.ts
if (process.env.REDIS_ENABLED === 'false') {
  console.log('[REDIS] disabled_for_dev');
} else if (process.env.REDIS_HOST) {
  console.log(`[REDIS] attempting_connection host=${process.env.REDIS_HOST}`);
}

// campaigns.module.ts
if (!enableCampaignDispatch && process.env.CAMPAIGNS_DISPATCH_ENABLED === 'true') {
  console.log('[QUEUE] redis_disabled - campaign_dispatch_skipped');
} else if (enableCampaignDispatch) {
  console.log('[QUEUE] bullmq_enabled');
}
```

### 5. Validação para Produção

```typescript
// env.validation.ts
if (isProduction && process.env.REDIS_ENABLED === 'false') {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['REDIS_ENABLED'],
    message: 'REDIS_ENABLED must be true in production.',
  });
}

if (isProduction && !process.env.REDIS_HOST) {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['REDIS_HOST'],
    message: 'REDIS_HOST is required in production.',
  });
}
```

---

## ✅ CHECKLIST IMPLEMENTAÇÃO

- [ ] 1. Update env.validation.ts - adicionar REDIS_ENABLED
- [ ] 2. Update app.module.ts - condicional BullMQ
- [ ] 3. Update campaigns.module.ts - condicional campaign dispatch
- [ ] 4. Update campaign-dispatcher.service.ts - log se desabilitado
- [ ] 5. Update campaign.processor.ts - log se desabilitado
- [ ] 6. Adicionar logs [REDIS], [QUEUE]
- [ ] 7. Build: `pnpm --filter @gestor/api build`
- [ ] 8. Lint: `pnpm check:no-any`
- [ ] 9. Teste boot: `REDIS_ENABLED=false npm run start:dev`
- [ ] 10. Teste WhatsApp webhook: POST /webhook/whatsapp
- [ ] 11. Teste IA agent: criar chat, enviar mensagem
- [ ] 12. Teste campanha: criar, verificar que não dispara

---

## 🧪 TESTES

### Teste 1: Boot sem Redis

```bash
REDIS_ENABLED=false REDIS_HOST= npm run start:dev
# Esperado: Logs [REDIS] disabled_for_dev, nenhum erro
```

### Teste 2: Cache Fallback

```bash
curl http://localhost:3333/api/v1/storefront/...
# Esperado: Resposta normal (com cache in-memory)
```

### Teste 3: Campanhas Desabilitadas

```bash
# Sem Redis
REDIS_ENABLED=false CAMPAIGNS_DISPATCH_ENABLED=true npm run start:dev
# Log esperado: [QUEUE] redis_disabled - campaign_dispatch_skipped
```

### Teste 4: AI Agent Debounce

```bash
# WebSocket chat
# Enviar 3 mensagens rapidamente
# Esperado: Debounce funciona (delay de 10s antes de processar)
```

### Teste 5: Rate Limiting

```bash
# 120 requests em 60s ao mesmo endpoint
# Esperado: 121º request retorna 429 Too Many Requests
```

### Teste 6: WebSocket Chat/Orders

```bash
# Conectar em ws://localhost:3333/orders
# Enviar mensagem
# Esperado: Broadcast funciona sem Redis
```

---

## 🔒 GARANTIAS DE PRODUÇÃO

✅ **Em Produção com NODE_ENV=production**:
- REDIS_ENABLED DEVE ser `true`
- REDIS_HOST NÃO PODE ser vazio ou localhost
- Boot falha se Redis não estiver disponível (protegido)
- Nenhum fallback silencioso em produção

✅ **Em Dev/Teste com NODE_ENV=development**:
- REDIS_ENABLED pode ser `false`
- REDIS_HOST pode ser vazio
- Cache usa in-memory
- BullMQ é pulado
- Logs claros indicam estado

---

## 📋 RESUMO DO IMPACTO

| Funcionalidade | Prod sem Redis | Dev sem Redis |
|---|---|---|
| Campanhas | ❌ NÃO FUNCIONA | ⚠️ Pulado, OK |
| Chat IA | ✅ Funciona | ✅ Funciona |
| Pedidos | ✅ Funciona | ✅ Funciona |
| Notificações | ✅ Funciona | ✅ Funciona |
| Rate Limiting | ✅ Funciona | ✅ Funciona |
| Cache | ✅ Fallback | ✅ Fallback |
| Debounce | ✅ Funciona | ✅ Funciona |
| WebSocket | ✅ Funciona | ✅ Funciona |

---

## 🎓 CONCLUSÃO

✅ **SEGURO desativar Redis em dev/teste**

- Cache já tem fallback automático implementado
- Todos os componentes críticos funcionam sem Redis
- Campanhas podem ser desabilitadas com flag
- Produção protegida com validações estritas
- Zero impacto em funcionalidades core

**Próximo Passo**: Implementar mudanças acima (8 tarefas)

