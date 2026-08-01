# Matriz de achados R0

| ID | Dominio | Estado | Severidade | Evidencia | Causa / risco | PR recomendada | Dependencia | Bloqueia Go-Live |
|---|---|---|---|---|---|---|---|---|
| E0-OPS | Seguranca e sessao | MITIGADO, pendente operacional | P0 | PR #35 integrada; CI `30678152290` e scanning `30678152243` PASS | JWT antigo ja rejeitado; falta revogacao persistida e smoke de nova sessao | Operacao E0, sem codigo novo | Dokploy, backup, fonte canonica de env | Sim |
| R1-001 | Checkout | PARCIALMENTE CONFIRMADO | P1 | `CheckoutPage.tsx:228-229,446-447,516`; `orders.service.ts:241-245` | prova de rede/duplo clique ainda ausente | P1-R1 checkout proof | tenant de teste autenticado | Nao para iniciar P1; sim para release do fluxo |
| R2-001 | Endereco e fulfillment | PARCIALMENTE CONFIRMADO | P1 | `checkout-validator.service.ts:63,273-306` | cobertura/endereco precisam de exercicio real | P1-R1 checkout proof | tenant com area de entrega | Nao para iniciar P1 |
| R3-001 | Entregador | PARCIALMENTE CONFIRMADO | P1 | `web-delivery/src/pages/LoginPage.tsx:17`; `driver-auth.*` | descoberta de tenant precisa de smoke em dominio real | P1-R3 driver auth | fixture de entregador | Nao |
| R4-001 | Filiais | NAO CONFIRMADO | P1 | dominio tenant/admin localizado | RBAC, isolamento e desativacao nao foram exercitados | P1-R4 branches | fixture admin | Nao |
| R9-001 | Disponibilidade de catalogo | PARCIALMENTE CONFIRMADO | P1 | `categories.service.ts:65,148`; `publication.service.ts:100-184` | regra publica por categoria/dia requer E2E | P1-R9 availability | tenant e horario controlados | Nao |
| R5-001 | Preview storefront | PARCIALMENTE CONFIRMADO | P2 | `StorefrontCustomizationPage.tsx:346,974-982` | isolamento preview/publico precisa de browser autenticado | P2-R5 | fixture tenant | Nao |
| R6-001 | Mobile e tema | JA CORRIGIDO ESTATICAMENTE | P2 | `index.css:320-377`; `AppLayout.tsx:941` | falta aparelho/viewport autenticado | P2-R6 visual proof | dispositivo ou emulador | Nao |
| R7-001 | Midia e nicho | PARCIALMENTE CONFIRMADO | P2 | `catalog/menu-import/menu-import.service.ts`; `MenuImportPage.tsx` | tratamento de arquivo real nao provado | P2-R7 | storage de teste | Nao |
| R8-001 | Cardapio base | PARCIALMENTE CONFIRMADO | P2 | `catalog/menu-import/menu-import.service.ts` | importacao opcional/reversivel requer fixture | P2-R8 | tenant de teste | Nao |
| R10-001 | Google login | FORA DO V1 | P2 | ausencia de provider OAuth de identidade | decisao comercial e privacidade pendentes | P2-R10, se aprovado | provider OAuth | Nao |
| BETA-001 | Split payment / integrations | CONHECIDO, fora do preset | P2 | `split-payment.controller.ts:73,105`; feature catalog beta | rotas incompletas nao devem ser expostas | Nenhuma no V1 | preset default-deny | Nao |

Nenhum valor de secret, token, cookie ou credencial e registrado nesta matriz.
