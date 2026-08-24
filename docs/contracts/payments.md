---
title: Contrato de Pagamentos
status: current
owner: engineering
last_verified: 2026-08-24
verified_against: feat/payment-monetization-foundation-r2 / entitlement-aligned R2
---

# Contrato de Pagamentos

## Escopo da Foundation R1

A Foundation R1 estabelece um domínio interno provider-neutral. Ela não implementa split,
Platform Fee, roteamento entre providers, refund, chargeback ou reconciliação financeira
completa. Mercado Pago continua sendo o único adapter externo existente; `asaas` é apenas
uma identidade de domínio nesta fase.

## Credenciais financeiras

- Cada conexão pertence a exatamente um tenant e um provider por meio de
  `PaymentProviderConnection`.
- Credenciais são serializadas e protegidas pelo envelope AES-256-GCM versionado já usado
  por marketplace. As chaves permanecem em `MARKETPLACE_CREDENTIALS_ENCRYPTION_KEY` e no
  keyring de rotação correspondente.
- `credentialsEncrypted`, tokens, segredos de webhook e chaves privadas nunca fazem parte
  de respostas de tenant, admin ou storefront.
- Logs e payloads de telemetria devem passar pela redação financeira. O inbox persiste hash
  SHA-256 do payload, não o payload bruto nem headers de autenticação.
- O DTO seguro de conexão contém somente identidade, provider, status, conta externa e
  timestamps operacionais.

### Compatibilidade com credenciais legadas

Ao resolver Mercado Pago, o backend procura primeiro uma conexão criptografada. Se ainda
existir token em `TenantSettings`, ele é migrado de forma atômica para a conexão e os campos
legados de token/segredo são limpos. Sem chave de criptografia configurada, a leitura legada
continua temporariamente para não interromper Pix, sem expor o segredo em respostas. Esse
estado requer configurar a chave e executar o fluxo de resolução/backfill antes de remover
definitivamente as colunas legadas.

## Conexões de provider

- A constraint única `(tenantId, provider)` limita a V1 a uma conexão por provider em cada
  tenant.
- Toda leitura, alteração de status ou acesso a credencial filtra explicitamente `tenantId`.
- Somente conexões `CONNECTED` podem fornecer credenciais ou ser associadas a uma tentativa.

## Tentativas de pagamento

Um pedido pode possuir várias `OrderPaymentAttempt`. Cada tentativa registra tenant, pedido,
provider, conexão opcional, valor, moeda, chave idempotente e status canônico.

- A constraint `(tenantId, orderId, idempotencyKey)` garante uma tentativa lógica por
  operação e permite a mesma chave em outro tenant.
- `(providerConnectionId, externalPaymentId)` cria o namespace da identidade externa sem
  assumir unicidade global entre providers.
- Tenant, pedido, provider, conexão, valor, moeda e chave idempotente são imutáveis no banco.
  Uma nova tentativa ou troca de provider sempre cria outra linha.
- Estados canônicos: `CREATED`, `PENDING`, `PAID`, `FAILED`, `EXPIRED`, `CANCELED`,
  `REFUNDED` e `PARTIALLY_REFUNDED`. Status de provider são mapeados pelo adapter.
- Transições usam compare-and-set no status para que concorrência não adquira o mesmo efeito
  financeiro duas vezes.

## Payment Monetization Foundation R2

- `PlatformFeePolicy` is provider-neutral and versioned by `selectorKey + version`, with an
  effective interval. The shared billing entitlement decision grants paid pricing to `active`,
  unexpired `trialing` and unexpired `grace_period`; expired windows, raw `past_due`, blocked
  statuses and tenants without a subscription use `FREE`. `PLAN:<billingPlanId>` supports
  plan-specific rules, and `PAID_DEFAULT` is the paid fallback.
- Initial persisted policies are `FREE` R$ 0.38 and `PAID_DEFAULT` R$ 0.20, BRL/FIXED. They
  are versioned data rather than business-logic constants.
- Every new `OrderPaymentAttempt` snapshots policy, version, type, amount, currency and plan.
  Pre-R2 attempts remain compatible and are not reinterpreted.
- `PlatformFeeEntry` separates PedeHub revenue, provider fee and customer refund. Refund does
  not erase an earned fee; a confirmed provider reversal creates one `TenantReceivable` for
  only the amount no longer retained.
- `OnlinePaymentActivation` is local and explicit. Signup creates no activation, connection
  or external account. A request records actor and technical terms version.
- SaaS Billing remains separate from Order Payments. No Asaas adapter, new Mercado Pago
  integration, router, external refund or provider pricing was added.

## Webhook inbox

O fluxo obrigatório é: autenticar pelo adapter, resolver tenant/provider/tentativa, registrar
o inbox, adquirir o processamento, aplicar o efeito e marcar o resultado.

- Somente o valor literal `authenticityVerified: true` permite registrar um evento.
- A constraint existente `(provider, eventId)` deduplica entregas e permite o mesmo ID entre
  providers diferentes.
- Conexão e tentativa são validadas conjuntamente por tenant e provider antes da persistência.
- Um evento concorrente em `processing` não processa novamente. Um evento `failed` pode ser
  adquirido por exatamente um retry com compare-and-set.
- A confirmação da transação/tentativa também usa compare-and-set; portanto webhook duplicado
  não repete a transição de pedido pago.

## Mercado Pago e Pix

O Pix atual cria ou reutiliza uma tentativa antes de chamar Mercado Pago e envia o ID da
tentativa como `X-Idempotency-Key`. Depois de uma chamada externa ambígua (timeout), a
tentativa permanece `PENDING`; é proibido fazer fallback silencioso para Pix manual ou outro
provider. Pix manual só é escolhido quando Mercado Pago não estava configurado antes da
chamada.

O endpoint público de status continua aceitando o UUID opaco da transação por compatibilidade.
Rotas autenticadas de status/cancelamento filtram tenant explicitamente.

## Evolução permitida

A próxima fase pode adicionar um adapter homologado e mapping provider-specific sem alterar
as invariantes acima. Split, Platform Fee e Payment Router exigem deliberação e contratos
próprios.
