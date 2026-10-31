# CMV histórico por pedido

## Fonte de verdade e escopo

O CMV histórico é uma leitura econômica, somente leitura, dos fatos físicos em
`StockMovement`. Somente `theoretical_depletion` e sua
`theoretical_reversal` vinculada participam do cálculo. A funcionalidade não
cria outro ledger de estoque, não cria `FinancialTransaction` e não altera
compras, caixa ou saldo financeiro.

O endpoint autenticado é `GET /analytics/orders/:orderId/historical-cmv` e
exige `reports.view_costs`. Todas as leituras filtram por `tenantId`.

## Contrato de cobertura

`totalCmv` só existe quando `coverageStatus` é `KNOWN`.

- `KNOWN`: todas as baixas ativas do pedido foram registradas com cobertura de
  composição completa e custo de proveniência conhecida.
- `PARTIAL`: há um `knownSubtotal` confiável, mas pelo menos uma baixa ou linha
  do pedido está incompleta/desconhecida. O subtotal não é margem final.
- `UNKNOWN`: não existe cobertura suficiente; `totalCmv` é `null`, nunca zero.

Movimentos legados, `unitCost = null`, e o valor numérico `0` sem
`costEvidence = known` permanecem ambíguos. Não há backfill por receita atual,
custo atual, rótulo de produto ou inferência a partir de zero.

## Tempo, Decimal e reversões

A coorte da consulta é o pedido e os fatos são datados por
`StockMovement.createdAt`; ela não é um relatório de margem por período de
vendas. A aritmética é `Prisma.Decimal`: quantidade física continua na escala
de seis casas capturada pela P1.4, linhas são agregadas sem arredondamento
prematuro e a fronteira monetária é arredondada em duas casas com `HALF_UP`.

Uma reversão nunca apaga nem reescreve a baixa. Ela referencia a baixa por
`reversalOfMovementId` e preserva quantidade, custo, evidência e cobertura.
Uma baixa integralmente conhecida e revertida tem CMV líquido conhecido de
`0.00`; uma baixa legada/ambígua revertida continua sem ser promovida a
conhecida.

## Limites deliberados

O contrato não aloca CMV a `OrderItem`, produto ou categoria: `orderId` e
`ingredientId` são a granularidade que os fatos atuais permitem provar. Os
dashboards/BI existentes continuam estimativos legados nesta etapa. Edição de
pedido, deltas econômicos, backfill de histórico e configuração aninhada de
combos permanecem fora do escopo.
