# Contrato — Push Notifications

> **Status:** Implementado (Sprint 3) — Backend + Frontend web-delivery operacionais.  
> **Última revisão:** 2026-07-16

Este documento descreve as regras de negócio, a arquitetura e os contratos para o envio de Push Notifications (Web Push) no Gestor Delivery SaaS PRO.

---

## 1. Responsabilidade do Domínio

O módulo de Push Notifications tem a finalidade **exclusiva** de entregar mensagens assíncronas (via service workers usando a API Web Push) para clientes conectados (entregadores e gestores de loja), garantindo a entrega mesmo que o aplicativo esteja em background.

- **Não é responsável por** e-mail, SMS ou WhatsApp.
- **Não é responsável por** armazenar histórico longo de notificações na UI.

---

## 2. Multi-Tenancy

- Toda `PushSubscription` deve obrigatoriamente estar associada a um `tenantId`.
- Nunca envie push para todos os destinatários globais sem filtrar por `tenantId`.
- No frontend, a `PushSubscription` só é ativada se houver um tenant context ativo.
- O payload do job BullMQ sempre deve incluir `tenantId`.

---

## 3. Entidades

### PushSubscription (Prisma)

```prisma
model PushSubscription {
  id            String    @id @default(uuid())
  tenantId      String    @map("tenant_id")
  recipientType String    @map("recipient_type") // 'driver' | 'tenant_user'
  recipientId   String    @map("recipient_id")
  endpoint      String    @db.Text
  p256dhKey     String    @map("p256dh_key") @db.Text
  authKey       String    @map("auth_key") @db.Text
  userAgent     String?   @map("user_agent") @db.VarChar(500)
  isActive      Boolean   @default(true) @map("is_active")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")
  lastUsedAt    DateTime? @map("last_used_at")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([tenantId, recipientId, recipientType, endpoint])
  @@index([tenantId, recipientId, recipientType, isActive])
  @@map("push_subscriptions")
}
```

---

## 4. Arquitetura de Envio

```
assignDriver()  ──────▶  PushService.enqueueDriverNotification()
                                   │
                                   ▼
                         BullMQ: notifications-push
                                   │
                                   ▼
                    PushNotificationProcessor.process()
                                   │
                       ┌───────────┴──────────┐
                       ▼                      ▼
              webpush.sendNotification()   log + cleanup
                       │
                  HTTP 404/410 → deleta subscription
```

### Tipo do Job (PushNotificationJob em @gestor/types)

```typescript
interface PushNotificationJob {
  type: 'send-to-recipient' | 'send-to-tenant-broadcast';
  tenantId: string;
  recipientType: 'driver' | 'tenant_user';
  recipientId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  icon?: string;
  tag?: string;
  url?: string;
  idempotencyKey?: string;
}
```

---

## 5. Eventos que Disparam Push

| Evento | Destinatário | Trigger |
|--------|-------------|---------|
| Driver atribuído a pedido | Entregador (`driver`) | `OrdersService.assignDriver()` |
| Driver removido de pedido | Entregador anterior (`driver`) | `OrdersService.assignDriver()` com `driverId = null` |

> Novos eventos devem ser adicionados via `PushService.enqueueDriverNotification()` ou método broadcast equivalente.

---

## 6. Endpoints REST

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/notifications/push/vapid-public-key` | Retorna a chave pública VAPID |
| `POST` | `/notifications/push/subscribe` | Registra uma subscription (autenticado) |
| `DELETE` | `/notifications/push/unsubscribe` | Remove a subscription do dispositivo atual |

**Segurança:** `tenantId` e `recipientId` são **sempre** extraídos do JWT, nunca aceitos no body.

---

## 7. Configuração de Ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `VAPID_PUBLIC_KEY` | Sim (para push) | Chave pública VAPID (formato base64url) |
| `VAPID_PRIVATE_KEY` | Sim (para push) | Chave privada VAPID — **nunca logar** |
| `VAPID_SUBJECT` | Sim (para push) | `mailto:...` ou URL do serviço |
| `PUSH_NOTIFICATIONS_ENABLED` | Não | `true` para habilitar o worker BullMQ |
| `REDIS_ENABLED` | Não | `false` desabilita o processador da fila |

> Se `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` não estiverem configuradas, o serviço entra em modo degradado (log warn, sem envio).

---

## 8. Frontend — web-delivery

### Fluxo de Opt-in
1. `usePushNotifications.ts` — hook que gerencia permissão e subscrição.
2. `ActiveDeliveryPage.tsx` — exibe banner contextual de opt-in.
3. `sw.js` — service worker registra evento `push` e exibe notificação.

### PWA
- `manifest.json` com ícones, `start_url`, `display: standalone`.
- `index.html` com meta tags de PWA.
- `skipWaiting` no SW para forçar atualização.

---

## 9. Segurança

- `VAPID_PRIVATE_KEY` **nunca** é enviada ao frontend nem logada.
- Endpoint `/subscribe` requer JWT válido (guard `JwtAuthGuard`).
- Service Worker valida domínio de origem em `url` recebida no push.
- HTTP 404/410 do push gateway → subscription é deletada imediatamente.

---

## 10. Idempotência e Resiliência

- Jobs na fila: 3 tentativas, backoff exponencial de 5s.
- Expiração/cancelamento de subscription tratado automaticamente no processor.
- `idempotencyKey` disponível no tipo do job para evitar envios duplicados (não implementado end-to-end, usar se necessário).

---

## 11. Gaps Conhecidos

| Gap | Severidade |
|-----|-----------|
| Push para `tenant_user` (staff) não implementado ainda | Média |
| Notificações de cancelamento de pedido para entregador não implementadas | Média |
| Inbox de notificações no frontend não implementada | Baixa |
| Não há teste automatizado cobrindo o fluxo E2E de push | Alta |

---

## 12. Referências

- API Push Web (MDN): https://developer.mozilla.org/pt-BR/docs/Web/API/Push_API
- Biblioteca Backend: `web-push`
- Fila: `NOTIFICATIONS_PUSH_QUEUE = 'notifications-push'` em `@gestor/types`
- Processor: `apps/api/src/notifications/push-notification.processor.ts`
- Service: `apps/api/src/notifications/push.service.ts`
- Hook: `apps/web-delivery/src/hooks/usePushNotifications.ts`
- SW: `apps/web-delivery/public/sw.js`
