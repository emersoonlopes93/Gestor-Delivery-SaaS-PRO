---
title: Contrato do Ciclo de Vida de Pedido
status: current
owner: engineering
last_verified: 2026-07-15
verified_against: main-copy / c63d394
---

# Contrato do Ciclo de Vida de Pedido (Order Lifecycle)

> A máquina de estados do Pedido (`Order`) é a espinha dorsal operacional. Alterações nas transições afetam o KDS, WhatsApp, Entregadores e Webhooks externos (iFood).

---

## 1. Fonte de Verdade

As transições válidas estão definidas de forma rígida (hardcoded) no arquivo `@gestor/types` em `packages/types/src/order.ts`:

```typescript
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready_for_pickup', 'ready_for_delivery', 'cancelled'],
  ready_for_pickup: ['completed'],
  ready_for_delivery: ['out_for_delivery'],
  out_for_delivery: ['completed'],
  completed: [],
  cancelled: [],
  draft: ['confirmed', 'cancelled'],
};
```

Nenhum código no backend ou frontend tem permissão de pular estados de forma arbitrária que viole este mapa (ex: de `pending` para `out_for_delivery`).

## 2. A API de Transição (`OrdersService`)

Para avançar o status de um pedido no backend, **NUNCA** chame o `prisma.order.update()` passando status direto. 

Use sempre o método de transição do domínio, que aciona gatilhos vitais:
```typescript
await this.ordersService.updateStatus(tenantId, orderId, newStatus, actorPayload);
```

**O que o `updateStatus` faz por baixo dos panos:**
1. Confere validade via `ORDER_STATUS_TRANSITIONS`.
2. Emite eventos via WebSocket no `OrdersGateway` (atualizando o front em tempo real).
3. Cria um registro no `OrderHistory` detalhando quem alterou e quando.
4. Processa efeitos colaterais de pagamento se houver.
5. Emite notificações de WhatsApp (Handoffs/Preparação).

## 3. Estados Terminais

`completed` e `cancelled` são estados **Terminais**. 
Uma vez que um pedido alcança um destes estados, ele é travado.
Nenhuma alteração em itens, quantidades ou pagamento deve ocorrer.

> Observação sobre integrações: Pedidos originários do iFood podem receber status final no iFood e disparar o webhook de terminalidade. O sistema sincroniza forçando a terminalidade e registrando a origem da mudança no `OrderHistory`.

## 4. O Fluxo Padrão (Delivery Próprio)

1. Cliente no Storefront envia Checkout → Cria como `pending`
2. Operador aceita no Painel → `confirmed`
3. Operador ou Cozinha manda p/ preparo (KDS) → `preparing`
4. Cozinha termina prato → `ready_for_delivery`
5. Entregador assume/Operador despacha → `out_for_delivery`
6. Entregador finaliza → `completed`

## 5. WebSockets e UI Reactiva

O painel administrativo e o storefront reagem a mudanças através do WebSocket (namespace principal).
Quando a API processa a transição, ela emite:
- Evento: `orderStatusUpdated`
- Room: `tenant_${tenantId}`

Frontends devem confiar nos eventos socket e realizar re-fetch apenas do pedido específico (ou revalidar cache), não de listas gigantescas.
