# 🔧 Padrões & Referência de Código

## 1. BullMQ - Como Usar

### 1.1 Registrar uma fila (no módulo)

```typescript
// my-feature.module.ts
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'my-queue',
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 1000,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 10000,
        },
      },
    }),
  ],
})
export class MyFeatureModule {}
```

### 1.2 Criar um Processor (Worker)

```typescript
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';

interface MyJobData {
  id: string;
  payload: Record<string, any>;
}

@Processor('my-queue')
export class MyProcessor extends WorkerHost {
  private readonly logger = new Logger(MyProcessor.name);

  async process(job: Job<MyJobData>): Promise<{ success: boolean }> {
    this.logger.log(`Processing job ${job.id}...`);
    
    try {
      // Sua lógica aqui
      const result = await this.doSomething(job.data);
      return { success: true };
    } catch (error) {
      this.logger.error(`Job failed: ${error.message}`);
      throw error; // Re-throw para retry
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} failed: ${error.message}`);
  }

  private async doSomething(data: MyJobData): Promise<any> {
    // Implementação
    return { success: true };
  }
}
```

### 1.3 Injetar fila (num serviço)

```typescript
import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class MyService {
  constructor(
    @InjectQueue('my-queue') private readonly myQueue: Queue,
  ) {}

  async enqueueJob(data: MyJobData): Promise<void> {
    await this.myQueue.add('default', data, {
      priority: 1,
      delay: 5000, // Delay 5 segundos antes de processar
    });
  }

  async enqueueJobRetryable(data: MyJobData): Promise<void> {
    await this.myQueue.add('default', data, {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });
  }
}
```

### 1.4 Padrão: Alimentador de Fila (como Campaign Dispatcher)

```typescript
@Injectable()
export class MyDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('MyDispatcherService');
  private intervalId?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('my-queue') private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.logger.log('Starting queue feeder...');
    // Roda a cada 60 segundos
    this.intervalId = setInterval(() => this.feedQueue(), 60000);
  }

  onModuleDestroy() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  async feedQueue() {
    try {
      // Busca items pendentes
      const items = await this.prisma.myTable.findMany({
        where: { status: 'pending' },
        take: 50,
      });

      if (items.length === 0) return;

      // Adiciona à fila
      for (const item of items) {
        await this.queue.add('default', { id: item.id });
        
        // Marca como processando
        await this.prisma.myTable.update({
          where: { id: item.id },
          data: { status: 'processing' },
        });
      }

      this.logger.log(`Added ${items.length} jobs to queue`);
    } catch (error) {
      this.logger.error(`Feed error: ${error.message}`);
    }
  }
}
```

---

## 2. Cache Manager - Como Usar

### 2.1 Injetar Cache Manager

```typescript
import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class MyService {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async getOrCache(key: string, fetcher: () => Promise<any>): Promise<any> {
    // Tenta cache
    const cached = await this.cacheManager.get(key);
    if (cached) return cached;

    // Se não tem, busca e salva
    const data = await fetcher();
    await this.cacheManager.set(key, data, 60000); // 60s TTL
    return data;
  }

  async setCache(key: string, value: any, ttl: number = 60000): Promise<void> {
    await this.cacheManager.set(key, value, ttl);
  }

  async invalidate(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }

  async invalidatePattern(pattern: string): Promise<void> {
    // Redis só
    const keys = await this.cacheManager.store.getKeys(pattern);
    for (const key of keys) {
      await this.cacheManager.del(key);
    }
  }
}
```

### 2.2 Padrão: Cache com fallback

```typescript
async getCategoryWithCache(categoryId: string): Promise<Category> {
  try {
    const cached = await this.cacheManager.get(`category:${categoryId}`);
    if (cached) return cached;

    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (category) {
      await this.cacheManager.set(`category:${categoryId}`, category, 300000); // 5min
    }

    return category;
  } catch (error) {
    // Se cache falhar, apenas busca do DB
    this.logger.warn(`Cache error: ${error.message}`);
    return this.prisma.category.findUnique({
      where: { id: categoryId },
    });
  }
}
```

---

## 3. Throttler - Como Usar

### 3.1 Decorador em Endpoint

```typescript
import { Throttle } from '@nestjs/throttler';
import { Controller, Get } from '@nestjs/common';

@Controller('api/v1/items')
export class ItemsController {
  // Usa a config 'public' do ThrottlerModule
  @Throttle({ public: { limit: 60, ttl: 60 } })
  @Get()
  getAllItems() {
    return [];
  }

  // Usa a config 'auth' do ThrottlerModule
  @Throttle({ auth: { limit: 10, ttl: 60 } })
  @Post()
  createItem(dto: CreateItemDto) {
    return dto;
  }

  // Custom: 5 requests per 30 seconds
  @Throttle({ custom: { limit: 5, ttl: 30 } })
  @Get('/expensive')
  expensiveOperation() {
    return [];
  }
}
```

### 3.2 Skip Throttler

```typescript
import { SkipThrottle } from '@nestjs/throttler';
import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  // Este endpoint não será throttled
  @SkipThrottle()
  @Get()
  health() {
    return { ok: true };
  }
}
```

### 3.3 Throttler com Custom Key

```typescript
// app.module.ts
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60,
        limit: 120,
        // Custom keygen
        keyGenerator: (context: ExecutionContext) => {
          const request = context.switchToHttp().getRequest();
          // Por user_id em vez de IP
          return request.user?.id || request.ip;
        },
      },
    ]),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
```

---

## 4. WebSocket - Como Usar

### 4.1 Gateway Básico

```typescript
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: true,
  namespace: 'my-namespace',
})
export class MyGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('MyGateway');

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('sendMessage')
  handleMessage(
    @MessageBody() data: { roomId: string; message: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.join(`room:${data.roomId}`);
    
    // Broadcast para a room
    this.server.to(`room:${data.roomId}`).emit('messageReceived', {
      from: client.id,
      message: data.message,
      timestamp: new Date(),
    });

    return { status: 'ok' };
  }

  // Método para emitir de fora do gateway
  emitToRoom(roomId: string, event: string, data: any) {
    this.server.to(`room:${roomId}`).emit(event, data);
  }
}
```

### 4.2 Com Autenticação JWT

```typescript
@WebSocketGateway({
  cors: true,
  namespace: 'protected',
  // Aqui você pode validar o token antes de aceitar conexão
})
export class ProtectedGateway implements OnGatewayConnection {
  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    const token = client.handshake.auth?.token || 
                  client.handshake.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);
      client.data.userId = payload.sub;
      client.data.tenantId = payload.tenantId;
      
      // Join automatic room
      client.join(`user:${payload.sub}`);
    } catch (error) {
      client.disconnect();
    }
  }
}
```

### 4.3 Emitindo de um Serviço

```typescript
@Injectable()
export class NotificationService {
  constructor(
    private readonly myGateway: MyGateway,
    // ou via @Inject
  ) {}

  notifyRoom(roomId: string, message: string) {
    this.myGateway.emitToRoom(roomId, 'notification', {
      message,
      timestamp: new Date(),
    });
  }
}
```

---

## 5. Padrões Práticos

### 5.1 Fila com Cache Invalidation

```typescript
@Injectable()
export class ProductService {
  constructor(
    @InjectQueue('product-updates') private queue: Queue,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  async updateProductBatch(ids: string[]) {
    for (const id of ids) {
      await this.queue.add('update', { productId: id });
    }
  }

  async onProductUpdated(productId: string) {
    // Invalida cache
    await this.cache.del(`product:${productId}`);
    await this.cache.del('products:list'); // Lista também
  }
}
```

### 5.2 Throttler + Cache

```typescript
@Controller('expensive')
export class ExpensiveController {
  constructor(
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  // Throttled em 1 req/60s, mais cache de 5min
  @Throttle({ custom: { limit: 1, ttl: 60 } })
  @Get('/report')
  async getReport() {
    const cached = await this.cache.get('report');
    if (cached) return cached;

    const report = await this.generateExpensiveReport();
    await this.cache.set('report', report, 300000); // 5min
    return report;
  }
}
```

### 5.3 WebSocket + Dispatcher

```typescript
// Dispatcher alimenta fila
@Injectable()
export class EventDispatcher implements OnModuleInit {
  @InjectQueue('events') private queue: Queue;
  
  async feedQueue() {
    const events = await this.prisma.event.findMany({ /* ... */ });
    for (const event of events) {
      await this.queue.add('process', event);
    }
  }
}

// Processor emite via WS
@Processor('events')
export class EventProcessor extends WorkerHost {
  constructor(private gateway: MyGateway) { super(); }
  
  async process(job: Job) {
    const result = await this.handleEvent(job.data);
    
    // Broadcast resultado
    this.gateway.emitToRoom(job.data.roomId, 'eventProcessed', result);
    
    return result;
  }
}
```

---

## 6. Checklist de Implementação

### 6.1 Novo Feature com Fila

- [ ] Registrar `BullModule.registerQueue()` no módulo
- [ ] Criar `*.processor.ts` com `@Processor()` + `WorkerHost`
- [ ] Criar `*dispatcher.service.ts` com `OnModuleInit/OnModuleDestroy`
- [ ] Injetar `@InjectQueue()` no serviço
- [ ] Testar com `BULLMQ_ENABLED=true`
- [ ] Testar com `BULLMQ_ENABLED=false` (deve usar fallback ou skip)

### 6.2 Novo Feature com Cache

- [ ] Injetar `CACHE_MANAGER` no serviço
- [ ] Usar `cache.get()` antes de operação pesada
- [ ] Usar `cache.set()` com TTL apropriado
- [ ] Adicionar `cache.del()` em update/delete
- [ ] Testar sem Redis (deve usar fallback in-memory)

### 6.3 Novo Feature com WebSocket

- [ ] Criar `*.gateway.ts` com `@WebSocketGateway()`
- [ ] Validar autenticação em `handleConnection()`
- [ ] Usar `client.join()` para rooms
- [ ] Usar `server.to().emit()` para broadcast
- [ ] Adicionar tipos em interfaces
- [ ] Testar cliente via Socket.io client

### 6.4 Rate Limiting em Endpoint

- [ ] Adicionar `@Throttle()` ao método
- [ ] Usar nome da config pré-definida (default/auth/public)
- [ ] Ou adicionar nova config em `ThrottlerModule.forRoot()`
- [ ] Testar limit com múltiplas requests

---

## 7. Variáveis de Ambiente (Template)

```bash
# .env.example

# ========== BullMQ ==========
BULLMQ_ENABLED=false
CAMPAIGNS_DISPATCH_ENABLED=false

# ========== Redis ==========
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_TLS=false

# ========== Rate Limiting ==========
RATE_LIMIT_TTL_SECONDS=60
RATE_LIMIT_MAX_REQUESTS=120
RATE_LIMIT_AUTH_TTL_SECONDS=60
RATE_LIMIT_AUTH_MAX_REQUESTS=10
RATE_LIMIT_PUBLIC_TTL_SECONDS=60
RATE_LIMIT_PUBLIC_MAX_REQUESTS=60

# ========== Cache ==========
CACHE_TTL_SECONDS=60
```

---

## 8. Debugging

### 8.1 BullMQ

```bash
# Monitorar filas em tempo real
npx bull-cli connection redis://localhost:6379 \
  --watch campaign-dispatch

# Inspecionar jobs falhados
npx bull-cli connection redis://localhost:6379 \
  --queue campaign-dispatch --failed
```

### 8.2 WebSocket

```typescript
// Debug no gateway
@WebSocketGateway({ ... })
export class MyGateway {
  @SubscribeMessage('sendMessage')
  handleMessage(
    @MessageBody() data: any,
    @ConnectedSocket() client: Socket,
  ) {
    console.log('=== WebSocket Debug ===');
    console.log('Event:', 'sendMessage');
    console.log('Data:', JSON.stringify(data, null, 2));
    console.log('Client ID:', client.id);
    console.log('Rooms:', client.rooms);
    console.log('======================');
    
    return { ok: true };
  }
}
```

### 8.3 Cache

```bash
# Redis CLI
redis-cli KEYS '*'
redis-cli GET 'cache-key-name'
redis-cli TTL 'cache-key-name'
redis-cli FLUSHDB # Limpar tudo (desenvolvimento)
```

---

**Última atualização**: 31 de Maio de 2026
