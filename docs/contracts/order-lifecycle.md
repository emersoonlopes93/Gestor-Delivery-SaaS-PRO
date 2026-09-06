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

> Observação sobre integrações: em pedidos iFood, solicitações locais de confirmação/cancelamento são deferidas. O `202` externo não altera o `Order`; somente o evento oficial final aplica uma transição permitida por `ORDER_STATUS_TRANSITIONS`. Eventos incompatíveis não forçam terminalidade e geram evidência de divergência.

## 4. O Fluxo Padrão (Delivery Próprio)

1. Cliente no Storefront envia Checkout → Cria como `pending`
2. Operador aceita no Painel → `confirmed`
3. Operador ou Cozinha manda p/ preparo (KDS) → `preparing`
4. Cozinha termina prato → `ready_for_delivery`
5. Entregador assume/Operador despacha → `out_for_delivery`
6. Entregador finaliza → `completed`

Para logística multi-pedido, essas transições são coordenadas pelo agregado descrito em
[`delivery-runs.md`](./delivery-runs.md): iniciar a rota despacha atomicamente seus pedidos,
e concluir uma parada conclui somente o pedido correspondente. Falha de entrega cria retorno
pendente e não transforma o pedido em `cancelled`.

## 4.1 Idempotência do checkout público

`POST /orders/public-checkout/:slug` usa `Order.idempotencyKey` com unicidade por
`(tenantId, idempotencyKey)` como proteção durável. O storefront gera uma chave
versionada por tentativa lógica com fingerprint do payload material:

- retry do mesmo payload reutiliza a mesma chave;
- alteração material do pedido gera outra chave;
- chave versionada incompatível com o payload responde conflito;
- corrida concorrente na constraint retorna o pedido já confirmado, sem repetir
  os efeitos pós-criação;
- chaves legadas continuam aceitas durante a compatibilidade, mas não possuem a
  verificação de fingerprint do contrato versionado.

O estado visual do botão não é a única proteção: o cliente possui guard síncrono
contra reentrada e o banco continua sendo a barreira autoritativa contra pedidos
duplicados. Não usar lock somente em memória como substituto da constraint.

## 5. WebSockets e UI Reactiva

### 5.1 View model operacional do tenant

O board, a lista e o detalhe autenticado recebem o mesmo `OrderOperationalViewModel`, derivado no backend sem alterar a máquina de estados. Esse contrato expõe origem, ownership da entrega, capabilities, ações válidas para o status atual, operação marketplace pendente/falha e resumos financeiro, logístico e de produção.

- Card, drawer e drag-and-drop devem executar somente ações retornadas em `availableActions`.
- A lista é uma superfície de consulta, inclui estados terminais e reutiliza os mesmos labels de provider, ownership e financeiro; seus filtros e busca permanecem tenant-scoped no backend.
- `PROVIDER` e `UNKNOWN` nunca habilitam frota própria; o backend continua sendo a barreira fail-closed.
- Operações iFood/99Food marcadas como `PROVIDER_ASYNC` permanecem pendentes até o evento autoritativo.
- O drag-and-drop não pode executar cancelamento ou conclusão e não converte coluna diretamente em status.
- O resumo financeiro usa `Venda`/valor do pedido e não infere pagamento ou recebível do lojista.
- O resumo de produção é derivado apenas do status canônico; não inventa estado de KDS.

O painel administrativo e o storefront reagem a mudanças através do WebSocket (namespace principal).
Quando a API processa a transição, ela emite:
- Evento: `orderStatusUpdated`
- Room: `tenant_${tenantId}`

Frontends devem confiar nos eventos socket e realizar re-fetch apenas do pedido específico (ou revalidar cache), não de listas gigantescas.

No painel tenant, o evento canônico para essa reconciliação é `order.changed`
na sala autenticada `tenant:<tenantId>`. A UI busca `GET /orders/:id` e reaplica
o `OrderOperationalViewModel`; durante drag-and-drop, o hint do pedido arrastado
é adiado e uma leitura autoritativa precede qualquer transição.
