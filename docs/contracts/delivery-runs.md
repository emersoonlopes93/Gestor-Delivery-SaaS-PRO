# Turnos e rotas de entrega

## Escopo canônico

`DriverShift`, `DeliveryRun` e `DeliveryStop` são as entidades canônicas da logística própria. Um login de entregador identifica a sessão, mas não abre turno financeiro. Somente a loja, com `delivery.manage_drivers`, inicia ou encerra um turno remunerado. Online/offline é disponibilidade operacional independente e só pode ficar online com turno ativo. Um turno só pode terminar quando não existe rota ativa nem retorno pendente.

Uma rota pertence a um tenant, um entregador e ao turno ativo desse entregador. Ela contém uma ou mais paradas ordenadas, cada uma vinculada a um pedido de entrega pronto. Depois do início não é permitido adicionar pedidos nem criar uma segunda rota para o mesmo entregador.

## Máquinas de estado

- Turno: `ACTIVE` → `ENDED`.
- Rota: `PENDING_ACCEPTANCE` → `ASSIGNED` → `IN_PROGRESS` → `RETURNING` → `COMPLETED`. Recusa antes do início termina em `CANCELLED`.
- Parada: `PENDING` → `CURRENT` → `ARRIVED` → `DELIVERED`. Cancelamento do pedido termina a parada em `CANCELLED`. Tentativa sem sucesso registra motivo/tentativa e leva a `RETURN_TO_STORE` → `RETURNED_TO_STORE`.

`Order.status` permanece uma máquina separada e continua obedecendo `ORDER_STATUS_TRANSITIONS`. O início da rota move atomicamente os pedidos de `ready_for_delivery` para `out_for_delivery`. A conclusão de uma parada move somente o pedido correspondente para `completed`. Tentativa sem sucesso não cancela o pedido.

## Conclusão manual autorizada

O painel pode concluir manualmente uma parada de rota própria em andamento por `POST /delivery/runs/:id/stops/:stopId/complete-manually`. A rota e a parada são resolvidas pelo `tenantId` da sessão, a ação exige `delivery.dispatch`, e aceita somente a parada `CURRENT` ou `ARRIVED`. Provider delivery e ownership desconhecido não chegam a rotas próprias e, portanto, não são elegíveis.

O motivo é obrigatório e inclui um código estável `manager_manual:<code>` registrado na timeline do pedido. A operação usa a mesma transação serializável, transição canônica `out_for_delivery` para `completed`, atualização de parada, ledger e avanço/finalização da rota. Repetir após `DELIVERED` é idempotente e não duplica efeitos; falhas abortam a transação. Ao confirmar, o backend publica `order.changed` e um gatilho privado de rota para o entregador.

## Concorrência e isolamento

Todas as operações recebem `tenantId` explicitamente e executam em transação serializável com retry para conflito de serialização. Constraints parciais no PostgreSQL impedem simultaneamente:

- dois turnos ativos para o mesmo entregador;
- mais de um turno remunerado para o mesmo tenant, entregador e data comercial local;
- duas rotas ativas para o mesmo entregador;
- o mesmo pedido em duas paradas ativas;
- duas paradas `CURRENT` na mesma rota.

A rota possui `version`; reordenação exige a versão observada pelo cliente e contém exatamente as paradas futuras. Isso rejeita reordenações concorrentes sem lock em Redis.

## Histórico e snapshots

A parada preserva snapshots de número do pedido, cliente, telefone e endereço. Chegada, tentativas, falha, cancelamento, entrega e retorno possuem timestamps próprios. A rota mantém histórico append-only de operações e versões de sequência. Nenhum histórico anterior à migration é inventado.

## Disponibilidade

Uma rota em `PENDING_ACCEPTANCE`, `ASSIGNED`, `IN_PROGRESS` ou `RETURNING` mantém o entregador `busy`. Fora de rota, o próprio entregador alterna `available`/`offline`; essas alternâncias nunca criam, terminam ou remuneram turno. O turno ativo permanece aberto depois da rota; a loja encerra o turno e o entregador passa para `offline`.

## Despacho assistido e fila FIFO

O Auto-Dispatch V1 é assistido: ele sugere uma rota, mas a loja confirma a atribuição. A fila dos entregadores usa `dispatchQueueJoinedAt` persistido. Ficar online entra no fim da fila; permanecer online preserva a posição; ficar offline, iniciar/encerrar turno ou receber rota remove o entregador. Ao concluir a rota com turno ativo, o entregador volta disponível no fim da fila.

Ausência de GPS, localização desatualizada ou distância acima do limite podem fazer o algoritmo ignorar um entregador naquela sugestão, sem alterar sua posição FIFO. A carona automática apenas agrupa pedidos elegíveis dentro do raio e do limite configurados; ela não otimiza trajeto nem cria ETA. Sugestões são recalculadas no aceite e a criação da rota continua sujeita às constraints e transações canônicas.

O tenant consulta `GET /delivery/runs/smart-dispatch/suggestion` e confirma em `POST /delivery/runs/smart-dispatch/accept`, ambos protegidos por `delivery.dispatch`. Todos os filtros, inclusive fila, entregadores, pedidos e aceite, incluem `tenantId` derivado da sessão.

## Trava KDS antes da saída

Uma rota aceita só inicia normalmente quando todas as paradas ativas apontam para pedidos `ready_for_delivery`. O estado derivado é exposto em `DeliveryRunDTO.kds`, com bloqueio, quantidade e números humanos dos pedidos, além do indicador e horário de override. Motivo, ator e identificadores de auditoria não fazem parte desse DTO operacional do entregador.

A loja pode liberar uma rota `ASSIGNED` com `POST /delivery/runs/:id/kds-override`, permissão `delivery.dispatch` e motivo obrigatório. O override é run-scoped, tenant-scoped, versionado, registrado no histórico da rota e no `AuditLog`; ele não altera `Order.status`. Ao iniciar uma rota liberada, somente pedidos que já estão prontos mudam para `out_for_delivery`.

Quando um pedido de uma rota ainda não iniciada muda para `ready_for_delivery`, ou quando o override é aplicado, o backend publica `driverRouteEvent` apenas na sala privada do entregador daquela rota. O evento é um gatilho: o app refaz `GET /delivery/driver/work-state` e usa o DTO canônico, sem confiar em estado KDS derivado no payload do socket.

## Tracking e mapa operacional

O tracking detalhado é exigido somente quando existe `DriverShift ACTIVE` e a rota está em `IN_PROGRESS` ou `RETURNING`; concluir uma parada individual não encerra a captura. No APK Android, uma rota ativa usa serviço foreground com notificação persistente e buffer FIFO local limitado para reenviar pontos em ordem após reconexão. O PWA mantém apenas tracking em foreground e comunica claramente essa limitação.

`DeliveryRunDTO.origin` é opcional e só contém coordenadas reais da loja configurada pelo tenant. O retorno usa essa origem quando disponível; sem ela, a interface informa que o destino não está disponível e não infere rota a partir de endereços de clientes.

## Integração com ganhos

Turnos e paradas carregam snapshots financeiros definidos em [`driver-earnings.md`](./driver-earnings.md). A conclusão da parada e o encerramento do turno lançam ledger idempotente sem aguardar a rota completa.

## Limites da V1

A sequência é manual. Não há provedor de rotas pago, otimização, ETA, geocoding em lote ou financeiro por corrida. O mapa é esquemático e as linhas representam somente a ordem persistida das paradas, não trajeto viário.

## Routing V2 / ETA

Uma rota nova recebe um snapshot versionado com provider, qualidade (`ROAD` ou `DEGRADED`), geometria mínima, distância, duração e horário do cálculo. Cada parada recebe distância e duração do trecho e ETA cumulativo. A sequência automática usa nearest-neighbor determinístico, com desempate pela sequência anterior e ID; não tenta resolver VRP global.

`ROUTING_PROVIDER=osrm` e `ROUTING_OSRM_BASE_URL` habilitam rota viária. Timeout, 429, 5xx, payload inválido, ausência do provider ou coordenada ausente nunca são apresentados como rota viária: o serviço preserva a operação com Haversine rotulado como estimativa degradada, ou sinaliza rota indisponível quando nem a origem é válida. O cache em memória é chaveado por origem, paradas e provider.

Recálculo e reordenação são permitidos somente antes da saída (`PENDING_ACCEPTANCE` ou `ASSIGNED`). Depois de `IN_PROGRESS`, nenhuma parada é reordenada ou recalculada silenciosamente. Mudanças publicadas reutilizam `driverRouteEvent`; o evento continua sendo apenas gatilho para buscar o DTO canônico.

Pedidos nativos, sem `MarketplaceOrder`, são elegíveis para a frota própria. Pedidos marketplace só são elegíveis quando todos os vínculos persistidos declaram `deliveryOwnership=MERCHANT`. `PROVIDER` e `UNKNOWN` falham fechados no builder, Auto-Dispatch, criação manual/automática e recálculo Routing V2. O bloqueio acontece antes de qualquer criação de rota/parada ou alteração do entregador/pedido e registra apenas IDs operacionais, provider, ownership e motivo, sem PII.

O E2E determinístico PostgreSQL é `routing-v2.postgres.e2e.spec.ts`. Ele só executa com `ROUTING_V2_POSTGRES_E2E=1` e recusa host de banco não local; usa provider de rota fake, três pedidos elegíveis e dois bloqueados para provar ordenação, ETA e ausência de duplicação.

## API do painel tenant

As rotas abaixo exigem autenticação tenant; `tenantId` e ator são sempre derivados da sessão:

- `GET /delivery/runs/builder`: entregadores livres com turno ativo e pedidos prontos que não pertencem a outra rota ativa;
- `GET /delivery/runs/drivers/:driverId/work-state`: estado tenant-scoped do turno, rota e disponibilidade operacional;
- `POST /delivery/runs/drivers/:driverId/shift/start|end`: inicia ou encerra turno remunerado; exige `delivery.manage_drivers`, deriva tenant e impede duplicidade por data comercial;
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
- `POST /delivery/driver/shift/start` e `POST /delivery/driver/shift/end`: permanecem bloqueados com `403`; o motorista usa somente `PATCH /delivery/driver/status` para disponibilidade, e a loja controla o turno financeiro;
- `POST /delivery/driver/runs/:id/accept|reject|start|complete`: executam as transições da rota;
- `POST /delivery/driver/runs/:id/stops/:stopId/arrived|complete|failed|returned`: executam as transições da parada atual e dos retornos físicos.

`GET /delivery/driver/active-run` retorna somente a rota canônica atual. O alias legado `GET /delivery/driver/active-runs` permanece temporariamente disponível com headers de depreciação, mas não devolve mais uma lista de pedidos apresentada como rotas.

Encerrar turno ou sair da sessão enquanto existe turno ou rota ativa retorna conflito. Quando o logout é permitido, as inscrições Web Push do entregador naquele tenant são removidas antes da revogação da sessão.
