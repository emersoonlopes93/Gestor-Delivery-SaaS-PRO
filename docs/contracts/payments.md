# Contrato — Pagamentos e Gateway

> **Status:** Estável (gateway base) / Beta (billing por assinatura)  
> **Última revisão:** 2026-07-23  
> **Verificado contra:** `main-copy / 78daea7a`

---

## 1. Visão geral

O sistema separa dois contextos de pagamento:

| Contexto | Módulo | Descrição |
|----------|--------|-----------|
| **Pagamento de pedido** | `PaymentGatewayModule` | PIX, cartão, dinheiro no pedido do cliente |
| **Billing SaaS** | `BillingModule` | Assinatura do tenant na plataforma |

---

## 2. Métodos de pagamento de pedido

| Método | `PaymentMethod` | Descrição |
|--------|-----------------|-----------|
| Dinheiro | `cash` | Troco calculado pelo operador |
| PIX | `pix` | QR Code gerado pelo gateway |
| Cartão de crédito | `credit_card` | Pagamento online pelo gateway |
| Cartão de débito | `debit_card` | Pagamento online pelo gateway |
| Cartão na entrega | `card_on_delivery` | Cobrado pelo entregador |
| Outro | `other` | Registro manual |

---

## 3. Ciclo de vida do pagamento de pedido

```
draft → pending_payment → paid → (pedido avança)
                        ↓
                     failed / cancelled
```

- Pagamentos online usam webhook do gateway para confirmar.
- PIX tem QR Code com expiração configurável.
- Idempotência garantida por `idempotencyKey` no gateway.

---

## 4. Webhooks de pagamento

- Todos os webhooks validam assinatura **HMAC-SHA256** antes de processar.
- Eventos duplicados são detectados e ignorados (idempotência).
- O handler **nunca** altera estado de pedido sem confirmar assinatura válida.

```
POST /payment-gateway/webhook/:provider
  → valida assinatura HMAC
  → busca pagamento por referência externa
  → aplica transição de estado
  → dispara eventos (WebSocket, KDS, WhatsApp)
```

---

## 5. Billing SaaS (assinatura do tenant)

### Planos

- Planos são definidos por `BillingPlan` com `entitlements` (features incluídas).
- Um tenant com plano ativo tem `BillingSubscription` em estado `active`.
- Entitlements são consultados pelo `FeatureControlModule` para liberar features.

### Ciclo

```
trial → active → past_due → cancelled
                          ↘ grace_period (7d)
```

### Ledger

- Toda transação de billing é registrada no `BillingLedger` (imutável).
- Créditos, cobranças e ajustes são entradas separadas.
- Nunca modificar entradas existentes — apenas adicionar novas.

---

## 6. Regras inegociáveis

- **Nunca** alterar fluxo de pagamento sem considerar reconciliação e idempotência.
- **Nunca** alterar handlers de webhook sem considerar duplicidade de eventos.
- **Nunca** modificar o ledger — apenas inserir novas entradas.
- Assinatura HMAC-SHA256 deve ser validada **antes** de qualquer processamento.
- Segredos de webhook **nunca** são logados.

---

## 7. Configuração de ambiente

| Variável | Descrição |
|----------|-----------|
| `PAYMENT_GATEWAY_SECRET` | Segredo HMAC do gateway de pagamento |
| `PAYMENT_GATEWAY_URL` | URL base do gateway |
| `BILLING_WEBHOOK_SECRET` | Segredo HMAC do webhook de billing |

---

## 8. Referências

- Gateway: `apps/api/src/payment-gateway/`
- Billing: `apps/api/src/billing/`
- DTOs: `packages/types/src/billing.ts`, `packages/types/src/payment.ts`
- Feature Control: `apps/api/src/feature-control/`
