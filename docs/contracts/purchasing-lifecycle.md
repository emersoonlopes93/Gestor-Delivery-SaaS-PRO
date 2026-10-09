# Lifecycle de compras

Este contrato define as invariantes de recebimento, pagamento e cancelamento de compras.

## Recebimento e idempotência

`POST /purchasing/purchases` representa uma compra já recebida. Compra, itens, incremento de
estoque, movimentos `purchase_entry` e estado financeiro são gravados na mesma transação
serializável. Toda nova criação exige `idempotencyKey`, única por tenant, e armazena um
fingerprint SHA-256 do conteúdo econômico.

- Mesma chave e mesmo fingerprint retornam a compra existente, sem reaplicar efeitos.
- Mesma chave e fingerprint diferente retornam conflito.
- Cada movimento novo de entrada referencia `purchaseId` e `purchaseItemId`.
- Registros históricos não são associados por parsing de `notes`.

Recebimento parcial não é suportado.

## Estado financeiro

Compra pendente cria uma única despesa `pending`, ligada por `referenceType=purchase` e
`referenceId`. Ela não altera `FinancialAccount.balance`.

Compra paga na criação exige `accountId` ativo e do mesmo tenant. A transação financeira
`paid`, o débito da conta e o `PurchaseSettlement` único são atômicos. O mesmo modelo é usado
por `POST /purchasing/purchases/:id/pay`, que promove a despesa pendente existente em vez de
criar uma duplicata. Saldo negativo continua permitido.

Pagamento parcial não é suportado. Registros legados `partial` exigem reconciliação manual.

## Cancelamento e reversões

`POST /purchasing/purchases/:id/cancel` nunca exclui histórico. Para compras novas e
estruturalmente vinculadas, cria movimentos `purchase_reversal` com
`reversalOfMovementId`, quantidade e custo unitário históricos. O movimento original fica
intacto.

Se o estoque atual for insuficiente para a reversão integral, o cancelamento é bloqueado
antes de qualquer efeito. Compras históricas sem vinculação estruturada também são bloqueadas
para reconciliação manual.

- Compra pendente: reverte estoque e muda a despesa pendente para `cancelled`.
- Compra paga: reverte estoque, cria receita compensatória `paid` ligada por
  `reversalOfTransactionId`, restaura a mesma conta e marca o settlement como revertido.
- Repetições e concorrência são serializadas por lock transacional e constraints únicas.

Qualquer falha intermediária reverte toda a operação.

## Segurança e mutabilidade

Todas as leituras e mutações operacionais incluem `tenantId`. Contas inativas ou de outro
tenant não podem receber novas liquidações. Os endpoints mutadores exigem
`purchasing.manage`; o backend permanece a autoridade.

Como a criação já representa recebimento, não existe endpoint para editar campos econômicos,
itens, quantidades, total ou conta depois da efetivação. Ajustes devem usar fluxos explícitos
de inventário, cancelamento e nova compra.
