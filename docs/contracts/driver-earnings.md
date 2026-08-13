# Ganhos dos entregadores

## Separação financeira

`Order.deliveryFee` é o frete cobrado do cliente. `Order.normalDeliveryFee` é a taxa normal antes de benefício de frete. A remuneração do entregador nunca deriva silenciosamente do valor final cobrado.

## Configuração e snapshots

Cada tenant define diária, remuneração por entrega (`DRIVER_RATE_TABLE`, `NORMAL_DELIVERY_FEE`, `PERCENTAGE_NORMAL_FEE` ou `FIXED`) e se tentativa após chegada é remunerada. `DeliveryDriver` pode ter override tenant-scoped.

O início do turno congela diária e moeda no `DriverShift`. A criação da rota congela no `DeliveryStop` modo, base normal, percentual, valor fixo/tabela, distância quando aplicável, valor calculado, moeda e política de tentativa. Mudanças posteriores não recalculam histórico.

## Ledger

`DriverLedgerEntry` é append-only e tenant-scoped. O banco rejeita `UPDATE` e `DELETE`; correções usam novo `ADJUSTMENT`. `(tenantId, sourceKey)` garante idempotência.

- `DELIVERY_FEE`: lançado ao entregar; tentativa/cancelamento só paga com `arrivedAt` e snapshot permitindo tentativa.
- `DAILY_RATE`: lançado uma vez no encerramento válido do turno.
- `TIP_CASH`: já recebido pelo entregador e não aumenta o devido pela loja.
- `BONUS` e `ADJUSTMENT`: lançamentos gerenciais; ajuste exige motivo e ator.

Ganhos totais são a soma do ledger mais a diária prevista no turno ativo. Já recebido soma lançamentos diretos; a receber é total menos recebido diretamente. Settlement e payout não pertencem à R14.

## Segurança

Valores automáticos são calculados no backend. Toda operação filtra `tenantId`; o JWT determina `driverId`. Gorjeta cash exige pedido atendido pelo próprio entregador. Gestores precisam das permissões de delivery e ficam registrados como ator.

## Post-delivery online tip readiness

- Existing feedback flow: endpoints públicos consultam e gravam feedback após pedido concluído; feedback é único por pedido.
- Public token: `Order.publicTrackingToken`, usado em `/feedback/:token`.
- Notification channel: automação `post_order_review` cria campanha no canal configurado de campanhas/WhatsApp.
- Delay: `delayHours`, padrão de 2 horas, com janela de 24 horas.
- Payment primitive: o gateway Mercado Pago é acoplado ao pagamento do pedido; não há primitive pós-entrega para gorjeta.
- Idempotency: feedback e campanha possuem proteção por pedido; cobrança de gorjeta ainda não tem chave própria.
- Recommendation: **NEEDS FOUNDATION**.
