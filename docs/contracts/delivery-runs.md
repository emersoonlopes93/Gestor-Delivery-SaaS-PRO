# Turnos e rotas de entrega

## Escopo canônico

`DriverShift`, `DeliveryRun` e `DeliveryStop` são as entidades canônicas da logística própria. Um login de entregador identifica a sessão; somente a ação explícita de ficar online inicia um turno. Um turno só pode terminar quando não existe rota ativa nem retorno pendente.

Uma rota pertence a um tenant, um entregador e ao turno ativo desse entregador. Ela contém uma ou mais paradas ordenadas, cada uma vinculada a um pedido de entrega pronto. Depois do início não é permitido adicionar pedidos nem criar uma segunda rota para o mesmo entregador.

## Máquinas de estado

- Turno: `ACTIVE` → `ENDED`.
- Rota: `PENDING_ACCEPTANCE` → `ASSIGNED` → `IN_PROGRESS` → `RETURNING` → `COMPLETED`. Recusa antes do início termina em `CANCELLED`.
- Parada: `PENDING` → `CURRENT` → `ARRIVED` → `DELIVERED`. Cancelamento do pedido termina a parada em `CANCELLED`. Tentativa sem sucesso registra motivo/tentativa e leva a `RETURN_TO_STORE` → `RETURNED_TO_STORE`.

`Order.status` permanece uma máquina separada e continua obedecendo `ORDER_STATUS_TRANSITIONS`. O início da rota move atomicamente os pedidos de `ready_for_delivery` para `out_for_delivery`. A conclusão de uma parada move somente o pedido correspondente para `completed`. Tentativa sem sucesso não cancela o pedido.

## Concorrência e isolamento

Todas as operações recebem `tenantId` explicitamente e executam em transação serializável com retry para conflito de serialização. Constraints parciais no PostgreSQL impedem simultaneamente:

- dois turnos ativos para o mesmo entregador;
- duas rotas ativas para o mesmo entregador;
- o mesmo pedido em duas paradas ativas;
- duas paradas `CURRENT` na mesma rota.

A rota possui `version`; reordenação exige a versão observada pelo cliente e contém exatamente as paradas futuras. Isso rejeita reordenações concorrentes sem lock em Redis.

## Histórico e snapshots

A parada preserva snapshots de número do pedido, cliente, telefone e endereço. Chegada, tentativas, falha, cancelamento, entrega e retorno possuem timestamps próprios. A rota mantém histórico append-only de operações e versões de sequência. Nenhum histórico anterior à migration é inventado.

## Disponibilidade

Uma rota em `PENDING_ACCEPTANCE`, `ASSIGNED`, `IN_PROGRESS` ou `RETURNING` mantém o entregador `busy`. O entregador só volta a `available` quando a rota termina ou é recusada antes do início. O turno ativo permanece aberto depois da rota; encerrar o turno muda o entregador para `offline`.

## Tracking e mapa operacional

O tracking detalhado é exigido somente quando existe `DriverShift ACTIVE` e a rota está em `IN_PROGRESS` ou `RETURNING`; concluir uma parada individual não encerra a captura. No APK Android, uma rota ativa usa serviço foreground com notificação persistente e buffer FIFO local limitado para reenviar pontos em ordem após reconexão. O PWA mantém apenas tracking em foreground e comunica claramente essa limitação.

`DeliveryRunDTO.origin` é opcional e só contém coordenadas reais da loja configurada pelo tenant. O retorno usa essa origem quando disponível; sem ela, a interface informa que o destino não está disponível e não infere rota a partir de endereços de clientes.

## Integração com ganhos

Turnos e paradas carregam snapshots financeiros definidos em [`driver-earnings.md`](./driver-earnings.md). A conclusão da parada e o encerramento do turno lançam ledger idempotente sem aguardar a rota completa.

## Limites da V1

A sequência é manual. Não há provedor de rotas pago, otimização, ETA, geocoding em lote ou financeiro por corrida. O mapa é esquemático e as linhas representam somente a ordem persistida das paradas, não trajeto viário.

## API do painel tenant

As rotas abaixo exigem autenticação tenant; `tenantId` e ator são sempre derivados da sessão:

- `GET /delivery/runs/builder`: entregadores livres com turno ativo e pedidos prontos que não pertencem a outra rota ativa;
- `GET /delivery/runs/active`: rotas ativas com DTO canônico de paradas, sem expor objetos Prisma ou histórico interno;
- `GET /delivery/runs/order/:orderId`: resolve, dentro do tenant autenticado, a rota canônica que contém o pedido ou retorna `null`;
- `GET /delivery/runs/:id/locations`: retorna resumo operacional e amostras detalhadas ainda dentro da retenção de 30 dias;
- `GET/PATCH /delivery/runs/settings`: leitura e alteração auditada da exigência de aceite;
- `POST /delivery/runs`: criação e atribuição atômicas de uma rota com `driverId` e `orderIds` ordenados;
- `PATCH /delivery/runs/:id/reorder`: reordenação otimista das paradas futuras com `expectedVersion`.

O endpoint legado `POST /orders/:id/assign-driver` permanece temporariamente disponível com headers de depreciação. Os consumidores do painel usam `POST /delivery/runs`, inclusive para uma rota de parada única.

O mapa do painel usa Leaflet/OpenStreetMap apenas para visualização: mostra a origem, a sequência manual das paradas e a posição do entregador com estado de atualização explícito. A ligação visual entre pontos não representa rota viária, otimização ou ETA. O trajeto detalhado deixa de ser oferecido depois da janela de retenção, preservando o resumo operacional.

## API do entregador

As rotas abaixo exigem JWT de entregador. `tenantId` e `driverId` são sempre derivados da sessão validada; nenhum identificador operacional enviado pelo cliente pode substituir essa identidade:

- `GET /delivery/driver/work-state`: retorna o turno ativo e a rota ativa canônica, ou `null` para cada estado ausente;
- `POST /delivery/driver/shift/start` e `POST /delivery/driver/shift/end`: iniciam e encerram explicitamente o turno;
- `POST /delivery/driver/runs/:id/accept|reject|start|complete`: executam as transições da rota;
- `POST /delivery/driver/runs/:id/stops/:stopId/arrived|complete|failed|returned`: executam as transições da parada atual e dos retornos físicos.

`GET /delivery/driver/active-run` retorna somente a rota canônica atual. O alias legado `GET /delivery/driver/active-runs` permanece temporariamente disponível com headers de depreciação, mas não devolve mais uma lista de pedidos apresentada como rotas.

Encerrar turno ou sair da sessão enquanto existe turno ou rota ativa retorna conflito. Quando o logout é permitido, as inscrições Web Push do entregador naquele tenant são removidas antes da revogação da sessão.
