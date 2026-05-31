# Auditoria de Infraestrutura do Backend - Gestor Delivery SaaS PRO

**Data**: 31 de Maio de 2026  
**Escopo**: `apps/api/src`  
**Status**: Exploração completa das áreas principais

---

## RESUMO EXECUTIVO

| Tecnologia | Status | Obrigatório | Fallback | Implementação |
|-----------|--------|-----------|----------|----------------|
| **BullMQ** | ✅ Ativo | Condicional | ❌ Não | Campaign dispatch |
| **Cache (Redis)** | ✅ Ativo | Não | ✅ Sim (in-memory) | Global |
| **Throttler** | ✅ Ativo | Não | ❌ Não | Rate limiting |
| **WebSocket** | ✅ Ativo | Não | ❌ Não | Chat & Delivery |

---

## 1. BULLMQ - FILAS DE JOBS

### 1.1 Configuração Global

**Arquivo**: [app.module.ts](app.module.ts#L73-L92)

```typescript
BullModule.forRoot({
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  },
  defaultJobOptions: {
    removeOnComplete: 1000,
    removeOnFail: 5000,
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  },
})
```

**Habilitação Condicional**:
- `BULLMQ_ENABLED=true` OU `CAMPAIGNS_DISPATCH_ENABLED=true`
- Se desabilitado, não há importação de BullModule no app.module

---

### 1.2 Implementação: Campaign Dispatch

#### Fila: `campaign-dispatch`

| Aspecto | Detalhes |
|--------|----------|
| **Nome** | `campaign-dispatch` |
| **Arquivo Processor** | [campaigns/services/campaign.processor.ts](apps/api/src/campaigns/services/campaign.processor.ts) |
| **Arquivo Dispatcher** | [campaigns/services/campaign-dispatcher.service.ts](apps/api/src/campaigns/services/campaign-dispatcher.service.ts) |
| **Arquivo Módulo** | [campaigns/campaigns.module.ts](apps/api/src/campaigns/campaigns.module.ts) |
| **Status** | ✅ Ativo (condicional) |
| **Obrigatório** | ❌ Não (apenas se `CAMPAIGNS_DISPATCH_ENABLED=true`) |

#### Processor - `CampaignProcessor`

**Localização**: [apps/api/src/campaigns/services/campaign.processor.ts](apps/api/src/campaigns/services/campaign.processor.ts)

```typescript
@Processor('campaign-dispatch')
export class CampaignProcessor extends WorkerHost {
  // Processa: CampaignJobData {
  //   campaignId, dispatchId, tenantId, phone, customerName, messageTemplate, mediaUrl
  // }
}
```

**Fluxo de Processamento**:
1. ✅ Valida opt-out do cliente
2. ✅ Personaliza mensagem com nome
3. ✅ Envia via WhatsApp (texto ou mídia)
4. ✅ Atualiza status em banco (sent/failed)
5. ✅ Incrementa contador de enviados
6. ✅ Registra na inbox de chat

**Métodos**:
- `process(job)`: Processa job individual
- `@OnWorkerEvent('failed')`: Evento de falha

**Dependências**:
- `PrismaService`: Banco de dados
- `WhatsAppSenderService`: Envio de mensagens

**Fallback**: ❌ Não existe fallback em-memory

---

#### Dispatcher - `CampaignDispatcherService`

**Localização**: [apps/api/src/campaigns/services/campaign-dispatcher.service.ts](apps/api/src/campaigns/services/campaign-dispatcher.service.ts)

**Responsabilidades**:
- Monitora campanhas com status `running`
- Move dispatches com status `queued` para BullMQ
- Executa feed a cada 60 segundos (configurable)
- Marca campanhas como `completed` quando termina

**Lógica**:
```
1. OnModuleInit → inicia setInterval 60s
2. feedQueue() → busca campanhas running
3. Para cada campanha → busca 50 dispatches queued
4. Adiciona à fila BullMQ
5. Marca como processed
6. Quando todas terminam → completed
```

**Fallback**: ❌ Não existe

---

#### Integração no Módulo

**Arquivo**: [apps/api/src/campaigns/campaigns.module.ts](apps/api/src/campaigns/campaigns.module.ts)

```typescript
@Module({
  imports: [
    DatabaseModule,
    WhatsAppChannelModule,
    RbacModule,
    ...(enableCampaignDispatch
      ? [BullModule.registerQueue({
          name: 'campaign-dispatch',
          defaultJobOptions: {
            removeOnComplete: 100,
            removeOnFail: 1000,
            attempts: 3,
            backoff: { type: 'exponential', delay: 10000 },
          },
        })]
      : []),
  ],
  providers: [
    CampaignsService,
    ...(enableCampaignDispatch ? [CampaignDispatcherService, CampaignProcessor] : []),
  ],
})
```

---

### 1.3 Dados da Fila

#### Estrutura: `CampaignJobData`

```typescript
interface CampaignJobData {
  campaignId: string;
  dispatchId: string;
  tenantId: string;
  phone: string;
  customerName: string;
  messageTemplate: string;
  mediaUrl?: string | null;
}
```

#### Resultado: 

```typescript
{
  success: boolean;
  messageId?: string;
  skipped?: boolean;
  reason?: string;
}
```

---

### 1.4 Referências Encontradas

| Arquivo | Tipo | Uso |
|---------|------|-----|
| [app.module.ts](app.module.ts#L6) | Import | BullModule |
| [app.module.ts](app.module.ts#L73) | Config | BullModule.forRoot() |
| [campaigns.module.ts](apps/api/src/campaigns/campaigns.module.ts#L8) | Import | BullModule |
| [campaigns.module.ts](apps/api/src/campaigns/campaigns.module.ts#L20) | Config | BullModule.registerQueue() |
| [campaign.processor.ts](apps/api/src/campaigns/services/campaign.processor.ts#L1) | Import | Processor, WorkerHost |
| [campaign.processor.ts](apps/api/src/campaigns/services/campaign.processor.ts#L17) | Decorator | @Processor('campaign-dispatch') |
| [campaign-dispatcher.service.ts](apps/api/src/campaigns/services/campaign-dispatcher.service.ts#L3) | Import | @InjectQueue |
| [campaign-dispatcher.service.ts](apps/api/src/campaigns/services/campaign-dispatcher.service.ts#L14) | Injection | @InjectQueue('campaign-dispatch') |
| [ai-config-diagnostics.service.ts](apps/api/src/ai-agent/services/ai-config-diagnostics.service.ts#L40) | Config | bullmqEnabled check |

---

## 2. CACHE MODULE - REDIS COM FALLBACK IN-MEMORY

### 2.1 Configuração Global

**Arquivo**: [app.module.ts](app.module.ts#L95-L123)

```typescript
CacheModule.registerAsync({
  isGlobal: true,
  useFactory: async () => {
    try {
      if (!process.env.REDIS_HOST) {
        console.warn('⚠️ REDIS_HOST não configurado. Usando cache in-memory.');
        return {};
      }
      
      const store = await redisStore({
        socket: {
          host: process.env.REDIS_HOST,
          port: Number(process.env.REDIS_PORT || 6379),
          tls: process.env.REDIS_TLS === 'true' ? true : undefined,
          connectTimeout: 3000,
        },
        password: process.env.REDIS_PASSWORD || undefined,
        ttl: 60000, // 60s default
      });
      
      await (store as any).client.ping();
      return { store };
    } catch (err) {
      console.warn('⚠️ Falha ao conectar ao Redis. Usando fallback in-memory store:', err);
      return {};
    }
  },
})
```

### 2.2 Características

| Aspecto | Detalhe |
|--------|---------|
| **Status** | ✅ Ativo |
| **Obrigatório** | ❌ Não |
| **Fallback** | ✅ Sim (in-memory automático) |
| **TTL Padrão** | 60000ms (60 segundos) |
| **Escopo** | Global (isGlobal: true) |
| **Lib** | `cache-manager-redis-yet` |

### 2.3 Variáveis de Ambiente

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `REDIS_HOST` | `localhost` | Host do Redis |
| `REDIS_PORT` | `6379` | Porta do Redis |
| `REDIS_PASSWORD` | `undefined` | Senha (opcional) |
| `REDIS_TLS` | `false` | Usar TLS |

**Fallback automático se**:
- `REDIS_HOST` não definido
- Falha na conexão ao Redis
- Falha no teste de ping

### 2.4 Decoradores @Cacheable

**Status**: ❌ Nenhum encontrado

Nenhum decorator `@Cacheable`, `@CacheEvict` ou `@CachePut` foi encontrado no código.

**Conclusão**: Cache é apenas para armazenamento de dados em memória, não para decoradores em métodos individuais.

### 2.5 Referências Encontradas

| Arquivo | Linha | Uso |
|---------|-------|-----|
| [app.module.ts](app.module.ts#L7) | 7 | `import { CacheModule }` |
| [app.module.ts](app.module.ts#L8) | 8 | `import { redisStore }` |
| [app.module.ts](app.module.ts#L96) | 96 | `CacheModule.registerAsync()` |
| [config/env.validation.ts](apps/api/src/config/env.validation.ts#L37-L39) | 37-39 | Validação Redis vars |

---

## 3. THROTTLER - RATE LIMITING

### 3.1 Configuração Global

**Arquivo**: [app.module.ts](app.module.ts#L55-L68)

```typescript
ThrottlerModule.forRoot([
  {
    name: 'default',
    ttl: Number(process.env.RATE_LIMIT_TTL_SECONDS ?? 60),
    limit: Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 120),
  },
  {
    name: 'auth',
    ttl: Number(process.env.RATE_LIMIT_AUTH_TTL_SECONDS ?? 60),
    limit: Number(process.env.RATE_LIMIT_AUTH_MAX_REQUESTS ?? 10),
  },
  {
    name: 'public',
    ttl: Number(process.env.RATE_LIMIT_PUBLIC_TTL_SECONDS ?? 60),
    limit: Number(process.env.RATE_LIMIT_PUBLIC_MAX_REQUESTS ?? 60),
  },
]),
```

### 3.2 Guard Global

**Arquivo**: [app.module.ts](app.module.ts#L197)

```typescript
{
  provide: APP_GUARD,
  useClass: ThrottlerGuard,
}
```

### 3.3 Decoradores @Throttle

#### 📍 Orders Controllers

**Arquivo**: [orders/orders.controller.ts](apps/api/src/orders/orders.controller.ts#L35)

```typescript
@Throttle({ public: { limit: 60, ttl: 60 } })
@Get('/:id')
async getOrderDetail(...)
```

| Endpoint | Limite | TTL |
|----------|--------|-----|
| GET `/` | 60 req | 60s |
| GET `/:id` | 60 req | 60s |
| POST `/` | 60 req | 60s |

**Arquivo**: [orders/public-orders.controller.ts](apps/api/src/orders/public-orders.controller.ts#L42)

```typescript
@Throttle({ public: { limit: 60, ttl: 60 } })
@Get('/:id')
async getOrderDetail(...)
```

---

#### 📍 Auth Controllers

**Arquivo**: [auth/customer-auth.controller.ts](apps/api/src/auth/customer-auth.controller.ts)

| Endpoint | Limite | TTL | Tipo |
|----------|--------|-----|------|
| POST `/login` | 5 req | 60s | auth |
| POST `/register` | 10 req | 60s | auth |

**Arquivo**: [auth/tenant-auth.controller.ts](apps/api/src/auth/tenant-auth.controller.ts)

| Endpoint | Limite | TTL | Tipo |
|----------|--------|-----|------|
| POST `/login` | 10 req | 60s | auth |
| POST `/logout` | 10 req | 60s | auth |

---

### 3.4 Características

| Aspecto | Detalhe |
|--------|---------|
| **Status** | ✅ Ativo |
| **Obrigatório** | ❌ Não (proteção, não função) |
| **Fallback** | ❌ Não (guard global) |
| **Estratégia** | Por key (IP/User) |
| **Provedor** | Redis/Default |

### 3.5 Referências Encontradas

| Arquivo | Uso |
|---------|-----|
| [app.module.ts](app.module.ts#L4) | `import { ThrottlerModule }` |
| [app.module.ts](app.module.ts#L5) | `import { ThrottlerGuard }` |
| [app.module.ts](app.module.ts#L55) | `ThrottlerModule.forRoot()` |
| [app.module.ts](app.module.ts#L197) | `useClass: ThrottlerGuard` |
| [orders.controller.ts](apps/api/src/orders/orders.controller.ts#L4) | `import { Throttle }` |
| [orders.controller.ts](apps/api/src/orders/orders.controller.ts#L35,L45) | `@Throttle()` decorators |
| [public-orders.controller.ts](apps/api/src/orders/public-orders.controller.ts#L4) | `import { Throttle }` |
| [public-orders.controller.ts](apps/api/src/orders/public-orders.controller.ts#L42) | `@Throttle()` decorators |
| [customer-auth.controller.ts](apps/api/src/auth/customer-auth.controller.ts#L2) | `import { Throttle }` |
| [customer-auth.controller.ts](apps/api/src/auth/customer-auth.controller.ts#L12,L22) | `@Throttle()` decorators |
| [tenant-auth.controller.ts](apps/api/src/auth/tenant-auth.controller.ts#L6) | `import { Throttle }` |
| [tenant-auth.controller.ts](apps/api/src/auth/tenant-auth.controller.ts#L33,L40) | `@Throttle()` decorators |

---

## 4. WEBSOCKET / SOCKET.IO

### 4.1 Chat Gateway

**Arquivo**: [chat/chat.gateway.ts](apps/api/src/chat/chat.gateway.ts)

```typescript
@WebSocketGateway({
  cors: true,
  namespace: 'chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect
```

#### Configuração

| Aspecto | Valor |
|--------|-------|
| **Namespace** | `/chat` |
| **CORS** | ✅ Habilitado |
| **Status** | ✅ Ativo |
| **Obrigatório** | ❌ Não (real-time, não crítico) |

#### Eventos

| Evento | Tipo | Propósito |
|--------|------|----------|
| `joinTenant` | Subscribe | Cliente entra na room de tenant |
| `joinSession` | Subscribe | Cliente entra na room de sessão |
| `messageCreated` | Emit | Novo chat enviado para subscribers |
| `sessionUpdated` | Emit | Session atualizada |

#### Fluxo

```
1. handleConnection(client)
   - Valida JWT token
   - Extrai tenantId e userId
   - Valida permissões

2. @SubscribeMessage('joinTenant')
   - client.join(`tenant:${tenantId}`)
   
3. @SubscribeMessage('joinSession')
   - client.join(`session:${sessionId}`)
   
4. emitMessageCreated(tenantId, sessionId, message)
   - server.to(`tenant:${tenantId}`).emit('messageCreated', ...)
   - server.to(`session:${sessionId}`).emit('messageCreated', ...)
```

#### Segurança

- ✅ Validação JWT obrigatória
- ✅ Verificação de ownership de session
- ✅ Isolamento por tenant e session

#### Integração

**Módulo**: [chat/chat.module.ts](apps/api/src/chat/chat.module.ts)

```typescript
@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => AiAgentModule),
    RbacModule,
    WhatsAppChannelModule,
    JwtModule.register({}),
  ],
  providers: [QuickRepliesService, ChatGateway],
})
```

---

### 4.2 Delivery Tracking Gateway

**Arquivo**: [delivery/delivery-tracking.gateway.ts](apps/api/src/delivery/delivery-tracking.gateway.ts)

```typescript
@WebSocketGateway({
  cors: true,
  namespace: 'delivery',
})
export class DeliveryTrackingGateway implements OnGatewayConnection, OnGatewayDisconnect
```

#### Configuração

| Aspecto | Valor |
|--------|-------|
| **Namespace** | `/delivery` |
| **CORS** | ✅ Habilitado |
| **Status** | ✅ Ativo |
| **Obrigatório** | ❌ Não (tracking real-time) |

#### Eventos

| Evento | Tipo | Propósito |
|--------|------|----------|
| `joinTracking` | Subscribe | Cliente track um pedido |
| `joinTenantTracking` | Subscribe | Tenant track seus drivers |
| `updateDriverLocation` | Subscribe | Driver envia localização |
| `locationUpdate` | Emit | Atualização de localização |

#### Fluxo

```
1. handleConnection(client)
   - Apenas log

2. @SubscribeMessage('joinTracking')
   - client.join(`order:${orderToken}`)
   - Clientes recebem updates dessa room

3. @SubscribeMessage('joinTenantTracking')
   - client.join(`tenant:${tenantId}`)

4. @SubscribeMessage('updateDriverLocation')
   - Chama driversService.updateDriverLocation()
   - Persiste em DB (FIX para polling-based map)
   - Emite via WS para subscribers
   - server.to(`tenant:${tenantId}`).emit('locationUpdate', ...)
   - server.to(`order:${orderToken}`).emit('locationUpdate', ...)
```

#### Data

```typescript
interface DriverLocationUpdatedEvent {
  driverId: string;
  tenantId: string;
  lat: number;
  lng: number;
  lastLocationAt: string; // ISO timestamp
}
```

#### Integração

**Módulo**: [delivery/delivery.module.ts](apps/api/src/delivery/delivery.module.ts)

```typescript
@Module({
  imports: [DatabaseModule, AuthModule, RbacModule, forwardRef(() => OrdersModule)],
  providers: [
    DriversService,
    DeliveryTrackingGateway,
    DeliveryCoverageService,
    DeliveryRateService,
  ],
})
```

---

### 4.3 Características Compartilhadas

| Aspecto | Detalhe |
|--------|---------|
| **Lib** | `@nestjs/websockets` + `socket.io` |
| **CORS** | ✅ Habilitado em ambas |
| **Obrigatório** | ❌ Não (real-time opt-in) |
| **Fallback** | ❌ Não (requer conexão ativa) |
| **Autenticação** | Chat: JWT / Delivery: Simples |

### 4.4 Referências Encontradas

| Arquivo | Tipo | Uso |
|---------|------|-----|
| [chat.gateway.ts](apps/api/src/chat/chat.gateway.ts#L2-L9) | Import | WebSocket decorators |
| [chat.gateway.ts](apps/api/src/chat/chat.gateway.ts#L10) | Import | Server, Socket |
| [chat.gateway.ts](apps/api/src/chat/chat.gateway.ts#L26) | Decorator | @WebSocketGateway |
| [chat.gateway.ts](apps/api/src/chat/chat.gateway.ts#L30) | Decorator | implements OnGatewayConnection |
| [delivery-tracking.gateway.ts](apps/api/src/delivery/delivery-tracking.gateway.ts#L1-L8) | Import | WebSocket decorators |
| [delivery-tracking.gateway.ts](apps/api/src/delivery/delivery-tracking.gateway.ts#L15) | Decorator | @WebSocketGateway |

---

## 5. ANÁLISE DE DEPENDÊNCIAS POR MÓDULO

### 5.1 Campaigns Module

```
campaigns.module.ts
├── BullModule.registerQueue('campaign-dispatch') [CONDICIONAL]
├── CampaignsService
├── CampaignProcessor [CONDICIONAL]
├── CampaignDispatcherService [CONDICIONAL]
└── WhatsAppChannelModule (para enviar mensagens)
```

**Críticos**:
- ❌ BullMQ não é obrigatório (env var)
- ✅ WhatsApp é obrigatório (integração)

---

### 5.2 Chat Module

```
chat.module.ts
├── ChatGateway (WebSocket)
├── QuickRepliesService
├── AiAgentModule
├── JwtModule
└── WhatsAppChannelModule
```

**Críticos**:
- ❌ WebSocket não é obrigatório (real-time)
- ✅ AiAgentModule é dependência

---

### 5.3 Delivery Module

```
delivery.module.ts
├── DeliveryTrackingGateway (WebSocket)
├── DriversService
├── DeliveryCoverageService
├── DeliveryRateService
└── OrdersModule (forwardRef)
```

**Críticos**:
- ❌ WebSocket não é obrigatório
- ✅ DriversService é core

---

### 5.4 Orders Module

```
orders.module.ts
├── OrdersService
├── CheckoutValidatorService
├── CustomerService
├── CashbackService
├── TheoreticalStockService
├── Throttler @Throttle decorators
└── [NO BullMQ / NO WebSocket]
```

**Críticos**:
- ✅ Throttle é global
- ❌ Sem filas ou WebSocket

---

### 5.5 AI Agent Module

```
ai-agent.module.ts
├── ConversationService
├── AiOrchestratorService
├── AgentToolsService
├── AiProviderRegistryService
├── ChatModule (forwardRef)
├── OrdersModule (forwardRef)
├── DeliveryModule (forwardRef)
└── [NO BullMQ / NO WebSocket / NO Cache decorator]
```

**Críticos**:
- ✅ Múltiplas dependências
- ❌ Sem filas estruturadas
- ❌ Sem WebSocket direto

---

## 6. TABELA CONSOLIDADA

### 6.1 Status de Infraestrutura

| Tecnologia | Módulo | Status | Obrigatório | Fallback | Confid. |
|-----------|--------|--------|-----------|----------|---------|
| **BullMQ** | campaigns | ✅ | ❌ | ❌ | High |
| **Cache** | global | ✅ | ❌ | ✅ | High |
| **Throttler** | global | ✅ | ❌ | ❌ | High |
| **WebSocket (chat)** | chat | ✅ | ❌ | ❌ | High |
| **WebSocket (delivery)** | delivery | ✅ | ❌ | ❌ | High |

---

### 6.2 Variáveis de Ambiente

| Variável | Padrão | Módulo | Crítico |
|----------|--------|--------|---------|
| `BULLMQ_ENABLED` | `false` | campaigns | ❌ |
| `CAMPAIGNS_DISPATCH_ENABLED` | `false` | campaigns | ❌ |
| `REDIS_HOST` | `localhost` | cache/bullmq | ❌ |
| `REDIS_PORT` | `6379` | cache/bullmq | ❌ |
| `REDIS_PASSWORD` | `undefined` | cache/bullmq | ❌ |
| `REDIS_TLS` | `false` | cache/bullmq | ❌ |
| `RATE_LIMIT_TTL_SECONDS` | `60` | throttler | ❌ |
| `RATE_LIMIT_MAX_REQUESTS` | `120` | throttler | ❌ |
| `RATE_LIMIT_AUTH_TTL_SECONDS` | `60` | throttler | ❌ |
| `RATE_LIMIT_AUTH_MAX_REQUESTS` | `10` | throttler | ❌ |
| `RATE_LIMIT_PUBLIC_TTL_SECONDS` | `60` | throttler | ❌ |
| `RATE_LIMIT_PUBLIC_MAX_REQUESTS` | `60` | throttler | ❌ |

---

## 7. RECOMENDAÇÕES

### 7.1 BullMQ

✅ **Ativo e bem implementado**
- Condicional por env var (seguro)
- Fallback: Nenhum (aceitar como trade-off)
- Se desabilitar: Campanhas não funcionam

**Ação**: Manter como está

---

### 7.2 Cache

✅ **Ótimo com fallback in-memory**
- Redis com fallback automático
- Nenhum código dependente de @Cacheable
- Ideal para desenvolvimento local

**Ação**: Manter como está

---

### 7.3 Throttler

✅ **Adequado para proteção**
- Guard global aplicado
- Decoradores apenas em endpoints críticos
- Configurável por env var

**Ação**: Manter como está

---

### 7.4 WebSocket

✅ **Bem isolado, não crítico**
- Chat e Delivery separados
- Falha não quebra app
- CORS habilitado

**Ação**: Manter como está / Considerar server fallback

---

## 8. CONCLUSÕES

### 8.1 Arquitetura

A infraestrutura é **bem estruturada e condicional**:
- ✅ Todas as integrações externas são opcionais
- ✅ Fallbacks in-memory onde possível
- ✅ Variáveis de ambiente bem aplicadas
- ✅ Módulos desacoplados e forwardRef para ciclos

### 8.2 Pontos Fortes

1. **BullMQ condicional**: Não quebra app se desabilitado
2. **Cache resiliente**: Fallback automático para in-memory
3. **Throttler global**: Proteção sem SPOF
4. **WebSocket isolado**: Não crítico para funcionalidade

### 8.3 Pontos de Atenção

1. **Sem @Cacheable**: Cache não é usado em método-level
2. **WebSocket sem fallback**: Requer conexão ativa
3. **BullMQ sem retry em-memory**: Se Redis cai, campanhas perde

### 8.4 Sugestões Futuras

- [ ] Implementar @Cacheable em métodos críticos (queries pesadas)
- [ ] Considerar fallback para campanhas (queue in-memory + job scheduler)
- [ ] Adicionar health checks para WebSocket
- [ ] Documentar SLA de disponibilidade

---

**Fim da Auditoria**
