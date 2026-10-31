# Conciliação financeira 99Food

## Escopo e fontes de verdade

Este contrato separa quatro fatos que não podem ser usados como sinônimos:

- o detalhe do pedido contém venda bruta, pagamento do cliente, valor a cobrar e recebível estimado;
- Bill Data contém eventos financeiros explicativos por pedido/dia;
- Settlements Data contém o repasse agregado efetivamente processado;
- `FinancialAccount.balance` contém somente saldo realizado pelo ledger interno.

`FinancialProjection.merchantReceivable` continua sendo estimativa histórica. Bill entries não criam transação financeira e não alteram saldo.

## Provider read-only

As leituras usam token financeiro de aplicação, separado do token operacional por loja. O adapter chama `POST https://openapi.99food.com/v3/auth/authtoken/signIn` com as credenciais já configuradas da aplicação e mantém o `accessToken` apenas em cache até `expiresIn`; ele nunca sobrescreve o token operacional da conexão.

Os endpoints são:

- `POST https://openapi.99food.com/v3/finance/finance/getShopBillDetail`;
- `POST https://openapi.99food.com/v3/finance/finance/getShopBillWeek`.

O body envia `acceptor_code=app_shop_id`, datas `YYYYMMDD`, `page_no` e `page_size=200`. Uma requisição cobre no máximo 31 dias; um backfill manual cobre no máximo três meses e é dividido em janelas não sobrepostas.

Quando `MARKETPLACE_99FOOD_FINANCIAL_AUTO_SYNC_ENABLED=true`, BullMQ agenda uma reconciliação financeira durável por conexão. Exige `MARKETPLACE_99FOOD_ENABLED=true`, `REDIS_ENABLED=true` e `BULLMQ_ENABLED=true`; a validação de ambiente rejeita uma configuração insegura. A atividade de pedido solicita um job coalescido de janela quente sem aguardar o provider. Uma varredura BullMQ recorrente é o fallback de reconciliação. Os padrões são janela quente de três dias coalescida por 15 minutos e reconciliação de 31 dias a cada seis horas; todos são parâmetros limitados e nunca excedem a janela de 31 dias do provider. Essas cadências absorvem o atraso normal de publicação sem gerar uma chamada por pedido.

O endpoint manual `POST /finance/marketplaces/99food/sync` e os jobs automáticos chamam o mesmo serviço canônico. Um lease Redis por tenant e conexão evita que sync manual, janela quente e reconciliação agendada consultem a mesma loja simultaneamente entre instâncias. Job automático ocupado é ignorado até a próxima cadência; chamada manual ocupada recebe conflito, em vez de abrir uma consulta duplicada. BullMQ tenta falhas técnicas três vezes com backoff exponencial iniciado em cinco segundos. Uma resposta válida sem dados novos é sucesso de freshness, não alerta nem inferência de valor zero; a reconciliação recorrente permanece elegível.

Falhas reais de autenticação, autorização, negócio, provider, conteúdo inválido ou conteúdo inesperado não viram coleção vazia nem valor de R$ 0,00. A sincronização não pressupõe WhiteList financeira.

Para uma página financeira sem registros, o envelope documentado continua sendo `data.data=[]`. Como o provider também pode omitir essa lista em intervalo de Settlements sem resultado, o adapter aceita a omissão somente quando `errno=0`, `total_num=0`, `total_page` é `0` ou `1`, `page_no` corresponde à página solicitada e `page_size` é inteiro positivo. Qualquer outro sucesso sem lista permanece `INVALID_RESPONSE`, com metadados de shape sanitizados para diagnóstico; jamais é convertido em lista vazia por heurística.

Antes da consulta financeira, a loja precisa estar com a autorização operacional 99Food confirmada (`CONNECTED`). Uma conexão pendente não chama a Financial API: a API devolve `AUTHORIZATION_NOT_READY` e a interface orienta o gestor a concluir a verificação em **Canais de venda**. Isso não muda o token financeiro, que permanece separado.

Na verificação self-service, uma conexão sem token operacional utilizável segue o fluxo oficial `refresh` e depois `get`, uma vez por tentativa. Reaberturas com token ainda utilizável não provocam refresh. Falhas transitórias são `PROVIDER_UNAVAILABLE`; uma resposta não transitória que não confirme a loja permanece `AUTHORIZATION_NOT_READY`, sem expor credenciais ou detalhes internos.

IDs e timestamps de identidade (`orderId`, `dayPaymentId`, `weekPaymentId`, `shopId`, `businessTs`) são strings lossless desde o texto HTTP. O adapter protege também IDs numéricos dentro de `dayPaymentIDList` antes do `JSON.parse`. Valores monetários são strings inteiras no adapter e `BigInt` em centavos no banco; o sinal recebido é preservado.

## Persistência e idempotência

`MarketplaceBillEntry` representa cada evento. Sua identidade é `(tenantId, provider, connectionId, orderId, orderType, businessTs)`. O mesmo pedido pode ter receita, refunds e ajustes distintos. `orderType=5` não exige pedido interno.

`MarketplaceSettlement` representa um repasse por loja. Sua identidade é `(tenantId, provider, connectionId, weekPaymentId)`. A relação `MarketplaceSettlementDayPayment` persiste cada `dayPaymentId` de forma estruturada e única por repasse. `dayPaymentAmountList`, quando presente, fica preservado no payload bruto e não cria posting.

Bill aceita os tipos 1, 2, 3, 4, 5, 8 e 9, preservando sempre o sinal recebido. VAT, apelação do merchant, perda de refeição, CNPJ e CERC são fatos auditáveis do provider; não são saldo nem lançamento por si só.

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
- Homologação real depende de uma fase explicitamente autorizada com credenciais válidas; nenhuma chamada real faz parte dos testes locais.
- Sync real, banco remoto, Dokploy e deploy não fazem parte da validação local deste contrato.
