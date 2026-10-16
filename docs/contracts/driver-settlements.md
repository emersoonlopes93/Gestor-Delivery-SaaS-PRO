# Acertos financeiros dos entregadores

## Fonte autoritativa

`DriverLedgerEntry` continua sendo a fonte imutável dos ganhos. Um `DriverSettlement` registra somente que a loja quitou o saldo devido de turnos encerrados; ele não cria, altera ou remove ganhos.

`DriverSettlementItem` vincula cada turno integralmente quitado e preserva os valores autoritativos calculados no momento do acerto: ganhos brutos, recebido diretamente e devido pela loja. `shiftId` é único, impedindo dupla quitação.

## Elegibilidade

Um turno pode ser quitado somente quando:

- está `ENDED` e possui `endedAt`;
- a diária positiva já foi lançada no ledger;
- não possui rota em aceitação, atribuída, em andamento ou retorno;
- o saldo devido pela loja é positivo;
- não possui `DriverSettlementItem`.

O backend recalcula `grossEarnings - receivedDirectlyByDriver`. Gorjeta cash permanece nos ganhos e no recebido diretamente, mas não é paga novamente pela loja. Diferenças precisam ser registradas previamente como `ADJUSTMENT` no ledger.

## Idempotência e concorrência

- `(tenantId, idempotencyKey)` torna retries do mesmo pagamento idempotentes.
- `DriverSettlementItem.shiftId` único impede dois gestores de quitarem o mesmo turno.
- A criação usa transação PostgreSQL `Serializable`; conflitos `P2002` e `P2034` viram respostas de conflito seguras.
- O frontend nunca envia o valor final.

## Imutabilidade

Settlements confirmados e seus itens rejeitam `UPDATE` e `DELETE` por trigger no PostgreSQL. Reversão/void exige um domínio auditável próprio e ficou como follow-up; não existe exclusão simples.

## APIs e autorização

Tenant, leitura (`finance.read`):

- `GET /delivery/settlements/drivers/:driverId/summary`
- `GET /delivery/settlements/drivers/:driverId/shifts`
- `GET /delivery/settlements/drivers/:driverId/history`
- `GET /delivery/settlements/:id`

Tenant, criação (`finance.manage`):

- `POST /delivery/settlements`

Driver autenticado pode ler apenas o próprio resumo, histórico e detalhe em `/delivery/driver/settlements/*`. Todas as consultas derivam `tenantId`, ator e driver do JWT.

## Fora de escopo

Não há payout real, PIX API, carteira, pagamento parcial de turno, Global Driver Account ou gorjeta online.
