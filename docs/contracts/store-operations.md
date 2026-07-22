---
title: Contrato de operações presenciais da loja
status: current
owner: engineering
last_verified: 2026-07-22
verified_against: feat/sprint-6b-tables-printing / bc942978
---

# Operações presenciais: mesas, PDV, KDS e impressão

## Mesas

O contrato persistido atual vincula o atendimento ativo em `DineInTable.activeOrderId` e guarda apenas o valor visual normalizado em `Order.tableNumber`. Não existe `Order.tableId`: `tableNumber` continua necessário para leitura de pedidos históricos.

O PDV e o modo garçom aceitam uma mesa somente se o nome normalizado existir no tenant autenticado. Nomes são únicos por tenant; uma mesa com `activeOrderId` de outro pedido não pode ser tomada. Atualizar ou finalizar um rascunho libera somente vínculos que apontem para o próprio pedido, sempre no mesmo tenant. Não há estado `inactive` no modelo atual; a operação usa `free`, `occupied` e `waiting_bill`.

## Impressão

`PrintJob` é tenant-scoped, ligado a um pedido do mesmo tenant e possui status, tentativa, erro e limite de três tentativas. Reimpressão é uma ação manual autorizada; não é criada silenciosamente por falha de hardware. KDS, spooler e configurações de dispositivo exigem as permissões específicas de impressão/KDS.

O fallback obrigatório é do navegador: a UI abre uma visualização térmica legível e aciona `window.print()`. O ticket contém identificação, número/data do pedido, itens e complementos, observações, tipo, mesa/entrega, pagamento e total. QZ Tray e Bluetooth permanecem integrações opcionais; indisponibilidade deles não bloqueia pedido, KDS ou fallback. Bridge USB/rede nativa não faz parte deste contrato.

## Proposta de migration: tableId

**AGUARDANDO AUTORIZAÇÃO DE MIGRATION.** Não executar nesta sprint.

```sql
-- SQL proposto, não executar
ALTER TABLE "orders" ADD COLUMN "table_id" TEXT;
CREATE INDEX "orders_tenant_id_table_id_idx" ON "orders"("tenant_id", "table_id");
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_table_id_fkey"
  FOREIGN KEY ("table_id") REFERENCES "dine_in_tables"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
```

Prisma: adicionar `Order.tableId String?`, relação `Order.table` e índice `@@index([tenantId, tableId])`; o campo deve iniciar nullable. Backfill: associar somente pedidos cujo `tenantId` e `tableNumber` correspondam inequivocamente a `DineInTable.name`; manter os demais nulos e preservar `tableNumber`. Rollout em duas fases: (1) schema aditivo, backfill e escrita dupla; (2) API/UI passam a enviar e ler `tableId`, mantendo `tableNumber` como snapshot histórico. Rollback: reverter a leitura/escrita de `tableId` sem dropar coluna/FK; remoção exige migration destrutiva separada. Relatórios devem usar o snapshot histórico quando a FK for nula.
