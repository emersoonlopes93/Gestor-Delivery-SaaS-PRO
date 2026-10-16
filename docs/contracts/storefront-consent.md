# Contrato de consentimento do storefront

> Fundação técnica first-party para preferências de privacidade no cardápio público. Esta política não substitui validação jurídica.

## Escopo

O storefront mantém uma decisão local e tenant-scoped para três categorias:

| Categoria | Padrão | Finalidade | Pode ser desativada? |
|---|---|---|---|
| `necessary` | `true` | cardápio, compra, autenticação, preferências funcionais e acompanhamento do pedido | não |
| `analytics` | `false` | futura medição first-party de desempenho e funil | sim |
| `marketing` | `false` | futuras integrações de medição e publicidade | sim |

Esta fundação não emite eventos, não cria identificadores analíticos, não carrega providers e não envia a decisão ao servidor.

## Persistência e isolamento

- O registro canônico é `StorefrontConsentRecordV1`, definido em `packages/types/src/storefront-consent.ts`.
- A versão do schema é `1`; a versão inicial da política é `1.0.0`.
- A chave física segue `gestor:storefront-consent:v1:<tenantKey>`.
- `tenantKey` vem exclusivamente de `StorefrontPayload.tenant.id`, após o tenant público ser resolvido pelo backend.
- Uma decisão nunca é reutilizada entre tenants.
- Uma mudança de versão da política invalida a decisão anterior e reapresenta o banner; não há migração silenciosa.
- JSON ou schema inválido, tenant divergente, timestamp inválido, versão desconhecida e falha de storage resultam em default deny.
- Falha de leitura ou escrita não interrompe cardápio, carrinho ou checkout.

O registro não aceita `tenantId` vindo de payload externo, PII, metadata livre ou campos desconhecidos.

## Decisões e revogação

| Ação | Analytics | Marketing | Source |
|---|---:|---:|---|
| aceitar todos | `true` | `true` | `banner_accept_all` |
| aceitar apenas necessários | `false` | `false` | `banner_reject_optional` |
| salvar preferências | escolha | escolha | `preferences_save` |
| revogar opcionais | `false` | `false` | `preferences_revoke` |

`necessary` permanece literal `true`. Alterações preservam o instante da decisão original em `decidedAt` e atualizam `updatedAt`. A revogação não apaga carrinho, sessão, tema, PWA ou dados necessários de acompanhamento do pedido.

## Inventário técnico de storage

| Storage/recurso | Finalidade | Categoria | Pode ser bloqueado? |
|---|---|---|---|
| `gestor_cart_temp` em `localStorage` | carrinho e operação de compra | necessary | não |
| `customer-storage` em `localStorage` | autenticação do cliente | necessary | não |
| `gestor-delivery:storefront-theme` em `localStorage` | preferência visual funcional | necessary/functional | não |
| chaves PWA e Cache Storage | instalação, atualização e continuidade da experiência | necessary/functional | não |
| `tracking:token:*` e `tracking:dest:*` em `sessionStorage` | acompanhamento pós-compra | necessary | não |
| `gestor:storefront-consent:v1:*` em `localStorage` | preferências de privacidade | necessary | não |
| analytics first-party futuro | desempenho e funil | analytics | sim |
| Google, Meta e outros providers futuros | medição e publicidade | marketing | sim |

Rejeitar categorias opcionais não altera os storages necessários existentes.

## Interface pública interna

O provider único do storefront expõe:

- estado `loading`, `undecided` ou `decided`;
- categorias atuais e versão da política;
- `canUseAnalytics` e `canUseMarketing`;
- `getAnalyticsConsentSnapshot()`;
- ações para aceitar, rejeitar opcionais, personalizar e revogar.

`getAnalyticsConsentSnapshot()` converte explicitamente o registro para o contrato da PR 0A:

```text
StorefrontConsentRecordV1
→ { analytics, marketing, version }
→ AnalyticsConsentSnapshotV1
```

PR 1B deverá consultar `canUseAnalytics` antes de qualquer emissão comportamental. Integrações de marketing futuras deverão consultar `canUseMarketing`. Esta PR não cria dispatcher, adapter ou script.

## Acessibilidade

O banner permanece no fluxo da página e não bloqueia a leitura do cardápio nem cobre ações de compra. O centro de preferências usa dialog modal, foco confinado, fechamento por Escape, retorno de foco, labels e descrições associadas. Necessários aparecem ligados e desabilitados; analytics e marketing começam desligados.

## Limitações

- Não há persistência server-side auditável nesta fase.
- Não há endpoint, tabela Prisma, migration ou sincronização entre dispositivos.
- Não há Google Consent Mode, IAB TCF, CMP externa ou cookies opcionais.
- Textos e versão de política são uma decisão técnica inicial e ainda requerem validação jurídica antes de integrações reais.
