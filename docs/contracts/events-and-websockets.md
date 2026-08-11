# Eventos e WebSockets

## Autenticação e isolamento

- `/orders` aceita sessões de tenant validadas pelo servidor; salas `tenant:<tenantId>` são derivadas do JWT.
- `/delivery` aceita sessões de tenant e de entregador. A sala privada `driver:<tenantId>:<driverId>` é derivada exclusivamente da sessão validada e associada automaticamente na conexão.
- Salas públicas de acompanhamento usam token opaco de pedido validado e vinculado ao socket.
- O cliente nunca escolhe `tenantId` ou `driverId` para uma sala privada.
- A revogação de uma sessão desconecta somente sockets associados ao respectivo `sid`.

## Eventos privados do entregador

O servidor publica `driverDeliveryEvent` com o contrato `DriverDeliveryEvent`:

- `delivery.assigned`: nova atribuição; pode gerar som no app em primeiro plano e Web Push em segundo plano.
- `delivery.updated`: mudança de status ou remoção da atribuição.
- `delivery.cancelled`: cancelamento do pedido atribuído.

Todo payload contém `eventId`, `orderId`, `orderNumber`, `status` e `occurredAt`. O app deduplica por `eventId`; o polling de corridas a cada 15 segundos permanece como fallback de reconciliação.

## Disponibilidade e localização

Login identifica a sessão. `PATCH /delivery/driver/status` controla somente disponibilidade (`available`/`offline`). A permissão de localização e o envio de GPS são independentes. Enquanto houver pedido ativo, o servidor conserva `busy` e rejeita mudança manual de disponibilidade.
