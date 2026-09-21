# Conciliação financeira 99Food

## Escopo e fontes de verdade

Este contrato separa quatro fatos que não podem ser usados como sinônimos:

- o detalhe do pedido contém venda bruta, pagamento do cliente, valor a cobrar e recebível estimado;
- Bill Data contém eventos financeiros explicativos por pedido/dia;
- Settlements Data contém o repasse agregado efetivamente processado;
- `FinancialAccount.balance` contém somente saldo realizado pelo ledger interno.

`FinancialProjection.merchantReceivable` continua sendo estimativa histórica. Bill entries não criam transação financeira e não alteram saldo.

## Provider read-only

As leituras usam um token exclusivo da Financial API, distinto do token de pedidos
da loja. Antes da primeira consulta, o aplicativo faz
`POST https://openapi.99food.com/v3/auth/authtoken/signIn` com
`retailer=app_id` e `secret=app_secret`; lê `accessToken` e `expiresIn`, mantém
o token em cache até antes da expiração e compartilha autenticações simultâneas.
O limite informado para o sign-in é 100 requisições por minuto. O token e o
segredo nunca são registrados em logs. As consultas usam os endpoints:

- `POST https://openapi.99food.com/v3/finance/finance/getShopBillDetail`;
- `POST https://openapi.99food.com/v3/finance/finance/getShopBillWeek`.

O body envia `acceptor_code=app_shop_id`, datas `YYYYMMDD`, `page_no` e `page_size=200`. Uma requisição cobre no máximo 31 dias; um backfill manual cobre no máximo três meses e é dividido em janelas não sobrepostas. Não há scheduler automático enquanto rate limits oficiais não estiverem disponíveis.

Os dois endpoints exigem WhiteList especial. Negação de acesso é `FINANCE_ACCESS_NOT_ENABLED`, nunca uma coleção vazia nem um valor de R$ 0,00.

HTTP 200 confirma somente o transporte. O adapter valida também o envelope de
negócio: `errno` ou `code` numérico (inclusive quando serializado como string)
precisa indicar sucesso antes de ler `data`. Um erro de negócio retorna um código
sanitizado para suporte, sem registrar token, mensagem remota, PII ou payload
financeiro bruto. `data.records=[]` é um resultado vazio válido quando o envelope
indica sucesso; nunca cria repasse, lançamento ou altera saldo.

Uma resposta vazia, JSON inválido ou JSON sem os marcadores contratuais não é
tratada como recusa, lista vazia ou sucesso. Ela retorna erro de formato e o log
sanitizado registra somente status HTTP, content-type, tamanho/presença do corpo,
tipo e nomes de chaves do envelope/dados. A confirmação de um formato novo exige
uma captura autenticada desses metadados e contrato oficial antes de o adapter
aceitá-lo.

Em 2026-09-21, `bill_detail` devolveu HTTP 200 com envelope de erro
`error_code`, `error_description`, `Details` e `request_id`, sem `data`. O
adapter trata `error_code` numérico diferente de zero como erro de negócio e
nunca registra as descrições ou o request ID. Não há evidência de que
`error_code=0` seja um envelope de sucesso; sucesso continua exigindo os
marcadores contratuais acima e `data` paginada.

Após uma resposta HTTP 401, o cliente renova o token uma vez. Se a 99Food ainda
recusar a consulta, a API informa `FINANCE_PROVIDER_UNAUTHORIZED`, distinto da
permissão `finance.manage` do PedeHub e sem inferir se a causa remota é credencial
ou habilitação financeira. A orientação ao gestor é verificar a autorização da loja
e o acesso financeiro com o suporte; uma falha não prova que janelas anteriores de
uma sincronização de várias janelas não foram importadas.

IDs e timestamps de identidade (`orderId`, `dayPaymentId`, `weekPaymentId`, `shopId`, `businessTs`) são strings lossless desde o texto HTTP. O adapter protege também IDs numéricos dentro de `dayPaymentIDList` antes do `JSON.parse`. Valores monetários são strings inteiras no adapter e `BigInt` em centavos no banco; o sinal recebido é preservado.

## Persistência e idempotência

`MarketplaceBillEntry` representa cada evento. Sua identidade é `(tenantId, provider, connectionId, orderId, orderType, businessTs)`. O mesmo pedido pode ter receita, refunds e ajustes distintos. `orderType=5` não exige pedido interno.

`MarketplaceSettlement` representa um repasse. Sua identidade é `(tenantId, provider, weekPaymentId)`. A relação `MarketplaceSettlementDayPayment` persiste cada `dayPaymentId` de forma estruturada e única por repasse.

A correlação permitida é exclusivamente:

`MarketplaceBillEntry.dayPaymentId -> MarketplaceSettlementDayPayment.dayPaymentId -> MarketplaceSettlement.weekPaymentId`.

Valor, data próxima, notas e número visual do pedido nunca são usados para vincular fatos. A soma de `settlementAmount` dos bills é exibida para auditoria, mas não precisa igualar `withdrawAmount`; a diferença não cria balancing entry.

## Posting financeiro

A política é `MANUAL_CONFIRMATION`. A sincronização persiste o repasse como `LIQUIDATED_UNPOSTED`. A conexão pode apontar explicitamente para `settlementFinancialAccountId`; nenhuma conta é escolhida por fallback.

O endpoint de posting exige:

- repasse ainda não postado e sem drift do provedor;
- `weekPaymentId`, `withdrawDate` e `withdrawAmount` persistidos;
- moeda BRL;
- conta configurada, ativa e pertencente ao mesmo tenant.

Uma transação serializável cria o `FinancialTransaction`, vincula o repasse por unique constraint, altera o saldo e grava `postedAt`. O update condicional e a transaction impedem dois efeitos concorrentes. `withdrawAmount` positivo vira entrada de valor absoluto; negativo vira despesa de valor absoluto, mantendo o efeito líquido assinado no saldo conforme a convenção existente. O CRUD genérico de transações não pode criar nem editar uma referência `marketplace_settlement_99food`; esse lançamento pertence exclusivamente ao lifecycle de settlement.

Se amount, data ou moeda mudarem depois do posting, o repasse vira `RECONCILIATION_DISCREPANCY`. Os fatos originalmente postados, a transação e o saldo não são alterados silenciosamente; o payload observado fica nos metadados de discrepância.

## API, RBAC e UI

Todos os endpoints exigem feature `finance` e tenant autenticado:

| Operação | Endpoint | Permission |
|---|---|---|
| visualizar | `GET /finance/marketplaces/99food/reconciliation` | `finance.read` |
| sincronizar provider | `POST /finance/marketplaces/99food/sync` | `finance.manage` |
| configurar conta | `PUT /finance/marketplaces/99food/connections/:id/settlement-account` | `finance.manage` |
| registrar repasse | `POST /finance/marketplaces/99food/settlements/:id/post` | `finance.manage` |

A página Financeiro mostra bills e repasses separados, conta de destino, status de posting, composição e divergências. O Gestor legado e o Gestor 2.0 continuam reutilizando `OrderPaymentSection`; nenhum mapper financeiro paralelo foi introduzido.

## Limites operacionais

- Nenhum BillEntry é lançado individualmente no DRE nesta entrega, evitando duplicar venda/refund/comissão/repasse.
- Homologação real depende da WhiteList e de uma fase explicitamente autorizada.
- Sync real, banco remoto, Dokploy e deploy não fazem parte da validação local deste contrato.
