---
title: Contrato de Agendamento
status: beta
owner: engineering
last_verified: 2026-07-16
verified_against: main-copy / b73fa287
source_of_truth:
  - apps/api/prisma/schema.prisma
  - apps/api/src/scheduling/
  - apps/api/src/orders/checkout-validator.service.ts
  - apps/api/src/orders/orders.service.ts
  - packages/core/src/constants/features.ts
---

# Contrato de Agendamento

## Escopo e modalidades

O agendamento é suportado para pedidos de `delivery` e `pickup`. Consumo local (`dine_in`), marketplace/iFood, KDS, reservas de mesa, recorrência e calendários externos não fazem parte deste contrato. Pedidos imediatos continuam sem `scheduledFor` e `timeSlotId`.

A feature canônica é `scheduling`, atualmente `beta`. Para aparecer no painel/storefront e ser aceita no checkout, a capacidade efetiva do tenant e `SchedulingSettings.enabled`/`acceptScheduledOrders` precisam estar habilitados. Quando desabilitada, o storefront mantém somente o fluxo imediato, a consulta pública retorna lista vazia e o backend rejeita payloads de agendamento.

## Timezone e armazenamento

- A autoridade é `TenantSettings.timezone`, em formato IANA válido.
- `SchedulingSettings.timezone` é uma cópia/fallback legado; `America/Sao_Paulo` é usado apenas quando o tenant não tem valor configurado.
- Janelas (`HH:mm`) e datas de calendário são interpretadas no timezone da loja.
- Instantes de slots, `Order.scheduledFor` e `ScheduledOrder.scheduledFor` são persistidos como `DateTime` UTC e serializados em ISO 8601.
- O navegador não é autoridade. O storefront formata horários com o timezone retornado pela API e envia o instante ISO do slot selecionado.
- Timezone inválido bloqueia atualização/geração/reserva; não há conversão silenciosa. A conversão via Luxon considera as regras IANA, inclusive horário de verão.

## Configuração e janelas

`SchedulingSettings` define antecedência mínima, horizonte máximo em dias, intervalo dos slots, capacidade padrão e a permissão para agendar enquanto a loja está fechada no momento da compra.

`SchedulingWindow` define `dayOfWeek` de 0 (domingo) a 6 (sábado), `startTime`, `endTime` e `active`. Horários usam `HH:mm`, o fim deve ser posterior ao início e janelas do mesmo dia não podem se sobrepor ou duplicar. Janelas que atravessam meia-noite, como `22:00–02:00`, são rejeitadas; devem ser cadastradas como duas janelas em dias consecutivos.

Não há calendário automático de feriados nem modelo próprio de bloqueio. Fechamentos são avaliados pelos horários operacionais existentes da loja. `allowScheduleWhenClosed` permite comprar enquanto a loja está fechada agora, mas não permite selecionar um instante em que a loja estará fechada.

Ao mudar configurações ou janelas, a API regenera/reativa os slots aplicáveis e desativa slots futuros que deixaram de pertencer às janelas. Agendamentos já criados são preservados; mudanças não os deslocam automaticamente.

## Geração e disponibilidade

O backend gera slots a partir das janelas ativas no calendário local do tenant, converte os instantes para UTC e evita recriar intervalos já existentes. Um slot só é listado quando:

- a feature e as configurações estão habilitadas;
- está ativo e com status `available`;
- pertence ao dia local solicitado;
- está no futuro e respeita a antecedência mínima;
- não excede o horizonte máximo;
- `currentOccupancy < capacity`.

Slots manuais continuam disponíveis para operação administrativa, mas o checkout também exige que o slot pertença a uma janela ativa. Não há modalidade gravada na janela/slot: na versão beta, as mesmas janelas atendem entrega e retirada.

## Checkout, capacidade e concorrência

O frontend nunca cria um horário. Ele consulta os slots e envia `timeSlotId` mais `scheduledFor`, que deve ser exatamente `TimeSlot.startTime`.

O checkout revalida feature, configurações, modalidade, tenant, loja aberta no instante futuro, janela ativa, correspondência do instante, antecedência, horizonte, status e capacidade. A criação do pedido, do `ScheduledOrder` e a ocupação do slot ocorre na mesma transação Prisma. O slot é bloqueado com `SELECT ... FOR UPDATE`; portanto, checkouts concorrentes são serializados e a última vaga só pode ser consumida uma vez. Falha de reserva reverte o pedido inteiro.

Quando o slot lota ou deixa de ser válido, a API retorna erro 400 compreensível. O storefront mantém os demais dados, limpa a seleção, atualiza os slots e pede uma nova escolha.

## Persistência e ciclo do pedido

- Pedido agendado: `Order.isScheduled=true`, `Order.scheduledFor=TimeSlot.startTime` e um `ScheduledOrder` relacionado.
- Pedido imediato: `isScheduled=false`, `scheduledFor=null` e nenhum `ScheduledOrder`.
- O estado inicial continua `pending`, igual ao pedido imediato. Nenhum novo estado de `OrderStatus` foi criado.
- O pedido aparece imediatamente no painel/Kanban com indicador e instante agendado. A versão atual não impede confirmação/preparo antes do horário e não possui job para promover o pedido à operação ativa.
- Cancelar o pedido cancela o `ScheduledOrder` e libera a capacidade na mesma transação.
- Notas e duração estimada podem ser editadas. Para mudar data/slot, a operação segura suportada é cancelar e criar novo agendamento; não há deslocamento automático de reserva.
- Concluir o pedido não libera a vaga histórica, pois ela representa capacidade efetivamente consumida.

## Isolamento, autorização e observabilidade

Todas as leituras e mutações operacionais incluem `tenantId`. O tenant vem do contexto autenticado ou, no storefront público, do slug resolvido no backend. IDs de outro tenant retornam indisponível/não encontrado. O cliente nunca envia `tenantId`.

Rotas administrativas usam `TenantAuthGuard`, `PermissionsGuard` e permissões `scheduling.view`, `scheduling.manage`, `scheduling.create` ou `scheduling.update`. Logs de criação/remoção, geração, capacidade e pedido incluem identificadores operacionais sem payload ou dados pessoais; o interceptor HTTP global adiciona o correlation/request ID.

## Limitações beta

- A capacidade é compartilhada entre entrega e retirada.
- Não há feriados/bloqueios ad hoc nem job periódico de geração; regeneração ocorre por mudanças administrativas ou ação manual.
- Edição de data/slot exige cancelamento e nova reserva.
- Não há automação que retenha pedidos futuros fora da operação ativa até perto do horário.
- Geração concorrente de slots é protegida por consulta de existência, mas ainda não possui constraint única no banco para o intervalo.
