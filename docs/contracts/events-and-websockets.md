# Eventos e WebSockets

## Autenticação e isolamento

- `/orders` aceita sessões de tenant validadas pelo servidor; salas `tenant:<tenantId>` são derivadas do JWT.
- `/delivery` aceita sessões de tenant e de entregador. A sala privada `driver:<tenantId>:<driverId>` é derivada exclusivamente da sessão validada e associada automaticamente na conexão.
- Salas públicas de acompanhamento usam token opaco de pedido validado e vinculado ao socket.
- O cliente nunca escolhe `tenantId` ou `driverId` para uma sala privada.
- A revogação de uma sessão desconecta somente sockets associados ao respectivo `sid`.

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
