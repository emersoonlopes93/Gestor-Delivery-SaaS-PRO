---
title: Contrato de operações presenciais da loja
status: current
owner: engineering
last_verified: 2026-07-22
verified_against: feat/sprint-6b2-table-relation / 0a80d45d
---

# Operações presenciais: mesas, PDV, KDS e impressão

## Mesas

O atendimento ativo permanece em `DineInTable.activeOrderId`. `Order.tableId` é uma relação nullable com `DineInTable.id`, protegida por FK com `ON DELETE SET NULL` e índice `(tenantId, tableId)`. `Order.tableNumber` permanece o snapshot legível/histórico, inclusive quando a mesa é renomeada ou removida.

O PDV e o modo garçom aceitam uma mesa somente se o nome normalizado existir no tenant autenticado. Nomes são únicos por tenant; uma mesa com `activeOrderId` de outro pedido não pode ser tomada. Atualizar ou finalizar um rascunho libera somente vínculos que apontem para o próprio pedido, sempre no mesmo tenant. Não há estado `inactive` no modelo atual; a operação usa `free`, `occupied` e `waiting_bill`.

## Impressão

`PrintJob` é tenant-scoped, ligado a um pedido do mesmo tenant e possui status, tentativa, erro e limite de três tentativas. Reimpressão é uma ação manual autorizada; não é criada silenciosamente por falha de hardware. KDS, spooler e configurações de dispositivo exigem as permissões específicas de impressão/KDS.

O fallback obrigatório é do navegador: a UI abre uma visualização térmica legível e aciona `window.print()`. O ticket contém identificação, número/data do pedido, itens e complementos, observações, tipo, mesa/entrega, pagamento e total. QZ Tray e Bluetooth permanecem integrações opcionais; indisponibilidade deles não bloqueia pedido, KDS ou fallback. Bridge USB/rede nativa não faz parte deste contrato.

## Relação persistida de mesa: tableId

```sql
ALTER TABLE "orders" ADD COLUMN "table_id" TEXT;
CREATE INDEX "orders_tenant_id_table_id_idx" ON "orders"("tenant_id", "table_id");
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_table_id_fkey"
  FOREIGN KEY ("table_id") REFERENCES "dine_in_tables"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
```

O backfill normaliza espaços, filtra por `tenantId`, escreve somente `tableId IS NULL` e exige exatamente uma mesa correspondente. Sem correspondência ou diante de nomes ambíguos, `tableId` fica nulo. A operação é idempotente e não altera `tableNumber`.

Nos fluxos novos, PDV e garçom enviam `tableId`; a API valida a mesa no tenant, deriva o snapshot por seu nome e recusa `tableId`/`tableNumber` conflitantes. Durante a transição, o contrato legado por `tableNumber` continua aceito no backend apenas para compatibilidade, sempre resolvido dentro do tenant. Leituras retornam a relação quando presente e o snapshot como fallback. Impressão e reimpressão usam o snapshot para permanecerem legíveis.

Rollback: interromper as novas leituras/escritas de `tableId` sem remover coluna, FK ou índice. A remoção de `tableNumber` exige uma fase futura, migration destrutiva independente, inventário de consumidores e nova aprovação.
