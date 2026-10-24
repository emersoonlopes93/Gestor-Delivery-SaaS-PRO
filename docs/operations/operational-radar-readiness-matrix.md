# Matriz de prontidão operacional

## Escopo desta entrega

| Fluxo | Estado | Fonte de verdade | Bloqueio seguro | Evidência local |
| --- | --- | --- | --- | --- |
| KDS multiestação | READY_LOCAL | `PrintJob` kitchen tenant-scoped | Estação desligada bloqueia item/categoria/estação; não cria produção parcial | `kds.service.spec.ts` |
| Pronto automático | READY_LOCAL | `Order.status` via `OrdersService` | Só ocorre quando o último job kitchen está `completed` | `kds.service.spec.ts` |
| Pronto de provider | READY_LOCAL | Mesmo lifecycle canônico de pedido | Sem atalho de status; erros retornam ao fluxo canônico | `OrdersService.updateOrderStatus` |
| Entrega manual própria | READY_LOCAL | `DeliveryRun`, `DeliveryStop`, `Order` | RBAC `delivery.dispatch`, motivo obrigatório, ownership provider/unknown fora da rota | `delivery-runs.service.spec.ts` |
| Corrida gestor/entregador | READY_LOCAL | Transação serializável e estado da parada | Repetição em `DELIVERED` não repete status, ledger ou realtime | `delivery-runs.service.spec.ts` |
| Radar visual/GPS/outbox | OUT_OF_SCOPE | Não alterado | Sem inferir readiness a partir de mapa ou tracking | Escopo preservado |

`READY_LOCAL` não é evidência de homologação de provider nem de produção. A promoção requer CI verde no SHA da PR; o live check requer ambiente autenticado, SHA implantado, healthcheck e tenant/piloto explicitamente identificados.
