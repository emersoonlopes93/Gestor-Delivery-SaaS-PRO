# R0 - Auditoria funcional de prontidao Go-Live - 2026-07-31

## Decisao

**APROVADO PARA INICIAR P1/R1; Go-Live definitivo permanece BLOQUEADO por E0-OPS.**

Esta retomada auditou estaticamente a branch `docs/go-live-readiness-audit` no
SHA `0ecfe5dfbdd91bfd5ec0b1238d97d926139c36ab`, cuja base E0 e
`efbfefa31992fcd5d485067bd0b3323ef56c14e4`. A CI pos-merge da E0 esta verde:
CI `30678152290` e Secret scanning `30678152243` concluiram com sucesso. O
remoto `main-copy` avancou depois para `6e5acfa3`; essa deriva nao foi trazida
para a PR R0 documental.

Nao foi encontrado novo P0 de codigo/repository no preset estavel auditado.
`NotImplementedException` persiste somente em `split-payment`, feature beta e
fora do preset de Go-Live. A E0 esta **MITIGADA**, mas E0-OPS continua o unico
bloqueador operacional: redeploy do SHA integrado, revogacao global de
`AuthSession`, e smoke autenticado de nova sessao. E0H (purga coordenada do
historico) permanece planejada e nao foi executada.

## Preservacao e limites

- Worktree: `Gestor-Delivery-SaaS-PRO-go-live-audit`; branch limpa no inicio.
- `stash@{0}` e checkout principal foram preservados; nenhuma outra worktree
  foi modificada.
- PR #34 e PR #35 estavam integradas; a PR R0 #36 permanece Draft.
- Nenhuma producao, Dokploy, banco remoto, migration, seed, secret ou provider
  foi acessado. Resultado de UX, RBAC real e integracoes externas sem fixture
  autenticada e **BLOQUEADO POR AMBIENTE**, nao uma alegacao de passagem.

## Evidencia funcional R1-R10

| ID | Resultado | Prioridade | Evidencia estatica | Lacuna / proximo aceite |
|---|---|---|---|---|
| R1 pedido, resumo e envio duplicado | PARCIALMENTE CONFIRMADO | P1 | `CheckoutPage.tsx:228-229,446-447,516,977`; `orders.service.ts:241-245,285`; `orders.atomicity.spec.ts` | Smoke autenticado com dupla submissao e retry de rede deve provar um unico pedido. |
| R2 checkout progressivo e endereco | PARCIALMENTE CONFIRMADO | P1 | `CheckoutPage.tsx`; `checkout-validator.service.ts:63,273-306`; rotas `public-checkout/:slug` | Validar entrega, retirada, cobertura e endereco incompleto em tenant de teste. |
| R3 login de entregador sem slug manual | PARCIALMENTE CONFIRMADO | P1 | `web-delivery/src/pages/LoginPage.tsx:17`; `auth/driver-auth.controller.ts` e `driver-auth.service.ts` | Provar dominio principal, subdominio e erro seguro sem tenant/slug. |
| R4 criar/desativar filial | NAO CONFIRMADO | P1 | dominio tenant/admin localizado; exige fluxo e fixture com RBAC | Definir contrato de criacao, isolamento e desativacao sem apagar dados. |
| R5 preview versus storefront publico | PARCIALMENTE CONFIRMADO | P2 | `StorefrontCustomizationPage.tsx:346,974-982`; `storefront.service.ts` | Provar que preview nunca publica mudanca sem salvar/publicar. |
| R6 safe-area e temas mobile | JA CORRIGIDO ESTATICAMENTE | P2 | `web-tenant/src/index.css:320-377`; `AppLayout.tsx:723-727,941`; modais usam `safe-modal` | Prova visual autenticada em aparelho continua pendente. |
| R7 uploads, categoria e fallback de nicho | PARCIALMENTE CONFIRMADO | P2 | Catalogo/menu import existentes em `catalog/menu-import`; UI de customizacao usa fallback visual | Provar upload, erro de arquivo e fallback por nicho sem dados quebrados. |
| R8 importacao opcional de cardapio base | PARCIALMENTE CONFIRMADO | P2 | `catalog/menu-import/menu-import.service.ts`; `MenuImportPage.tsx` | Executar importacao reversivel em tenant de teste e provar ausencia de importacao automatica. |
| R9 disponibilidade de categoria/dias | PARCIALMENTE CONFIRMADO | P1 | `categories.service.ts:65,148`; `publication.service.ts:100-184`; `storefront.service.ts:205-229` | Confirmar no storefront que categoria/produto indisponivel nao pode ser comprado. |
| R10 login Google | NAO IMPLEMENTAR NO V1 | P2 | nao foi localizado provider OAuth de identidade; Google Maps nao e login | Exige decisao comercial, credenciais e revisao de privacidade; fora do Go-Live. |

## Achados transversais

- O caminho de pedido usa validacao server-side, chave de idempotencia e teste
  de atomicidade. Isso reduz o risco de pedido duplicado, mas nao substitui o
  smoke real R1.
- `scheduling`, `push_notifications`, marketplace/iFood, campanhas, KDS,
  printing e split payment sao beta/coming-soon ou tem dependencia operacional;
  ficam desabilitados no preset V1. Um TODO de upload de midia em WhatsApp nao
  pertence ao fluxo estavel do V1.
- A disponibilidade publica usa `AvailabilityService`; categorias possuem
  `isActive`. A combinacao categoria-dias precisa de prova funcional antes de
  promocao de escopo.
- Health, Redis/BullMQ, storage, CORS, logs e migrations requerem confirmacao
  operacional do ambiente. Nenhum P0 adicional foi inferido apenas por ausencia
  dessa evidência.

## Proximo passo seguro

Pode iniciar a PR P1/R1 de **prova e ajuste minimo do checkout**, sem migration,
sem mudanca de preset e sem deploy. A aceitacao deve cobrir um unico pedido sob
duplo clique/retry, resumo correto, entrega/retirada e erro recuperavel. A
integracao de qualquer P1 continua condicionada a E0-OPS documentada e CI verde.
