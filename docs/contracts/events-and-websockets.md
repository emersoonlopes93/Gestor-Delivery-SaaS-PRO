# Eventos e WebSockets

## Autenticação e isolamento

- `/orders` aceita sessões de tenant validadas pelo servidor; salas `tenant:<tenantId>` são derivadas do JWT.
- `/delivery` aceita sessões de tenant e de entregador. A sala privada `driver:<tenantId>:<driverId>` é derivada exclusivamente da sessão validada e associada automaticamente na conexão.
- Salas públicas de acompanhamento usam token opaco de pedido validado e vinculado ao socket.
- O cliente nunca escolhe `tenantId` ou `driverId` para uma sala privada.
- A revogação de uma sessão desconecta somente sockets associados ao respectivo `sid`.

## Reconciliação operacional de pedidos

O namespace autenticado `/orders` publica `order.changed` na sala derivada
`tenant:<tenantId>`. O `OrderChangedEvent` contém somente `eventId`, `orderId`,
`occurredAt` e `reason`; ele é um hint e nunca uma segunda fonte de verdade.

- o painel considera realtime pronto somente depois de `joinedTenant`;
- o socket já montado para notificações publica o hint em um bus tipado no navegador;
- Kanban e drawer reconciliam apenas `GET /orders/:id`, com cache busting;
- pedidos terminais saem do Kanban, mas continuam disponíveis na Lista;
- a Lista mantém busca, filtros, página e drawer e pede confirmação explícita em
  `Há atualizações` antes de reordenar resultados;
- polling completo é fallback sem sobreposição: 90 segundos conectado e 30
  segundos desconectado/reconectando; após 120 segundos sem confirmação o
  snapshot é apresentado como possivelmente desatualizado.

Mudanças de criação, status, edição, responsável pela entrega e operação
marketplace emitem o hint somente depois da escrita bem-sucedida. O payload não
carrega estado do pedido nem identidade tenant escolhida pelo cliente.

## Eventos canônicos de rota do entregador

O servidor publica `driverRouteEvent` somente na sala privada derivada `driver:<tenantId>:<driverId>`. O contrato `DriverRouteEvent` é um gatilho leve de reconciliação e contém `eventId`, `type`, `change`, `runId`, `occurredAt` e, quando aplicável, `stopId`. A identidade do entregador não é aceita no payload: ela permanece derivada da sala autenticada.

- `delivery.run_assigned`: nova rota atribuída;
- `delivery.run_updated`: aceite, recusa, início, conclusão ou reordenação;
- `delivery.stop_updated`: chegada, entrega, falha, retorno ou cancelamento de uma parada.

O app nunca aplica o evento como fonte de verdade: ao recebê-lo, refaz `GET /delivery/driver/work-state`. O polling desse estado a cada 15 segundos permanece como fallback de reconciliação. Cancelamento e reordenação são anunciados em região `aria-live` depois do refresh canônico.

## Compatibilidade por pedido

O servidor publica `driverDeliveryEvent` com o contrato `DriverDeliveryEvent`:

- `delivery.assigned`: nova atribuição; pode gerar som no app em primeiro plano e Web Push em segundo plano.
- `delivery.updated`: mudança de status ou remoção da atribuição.
- `delivery.cancelled`: cancelamento do pedido atribuído.

Todo payload contém `eventId`, `orderId`, `orderNumber`, `status` e `occurredAt`. Esse evento permanece temporariamente para compatibilidade de som, Web Push e endpoints legados; a máquina operacional do entregador usa `driverRouteEvent` e o estado canônico de turno/rota/parada.

## Disponibilidade e localização

Login identifica a sessão; ficar online inicia explicitamente um `DriverShift`. A permissão de localização e o envio de GPS em primeiro plano são independentes do turno. Enquanto houver rota ativa, o servidor conserva `busy`; somente a conclusão ou recusa válida da rota libera o entregador. Não existe permissão nem serviço de localização em background neste contrato.
