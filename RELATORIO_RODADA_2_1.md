# Relatorio Rodada 2.1 - Contraprova Manual + Hardening Final PDV/Caixa

Data: 2026-06-02

## 1. Veredito final da Rodada 2.1

**PASSOU COM RESSALVAS**

O nucleo PDV/Caixa esta tecnicamente vendavel: o backend bloqueia venda sem caixa aberto, venda finalizada vincula `cashSessionId`, registra movimento de caixa, recalcula frete via `DeliveryRateService`, salva endereco de delivery e transiciona pelo fluxo central em `OrdersService.updateOrderStatus`.

Ressalvas: a contraprova visual completa A-F em navegador/operacao real nao foi executada nesta rodada; lint e `check:no-any` seguem vermelhos por dividas preexistentes; nao ha runner automatizado de testes unitarios/e2e para POS/Cash.

## 2. Estado real do MVP

| Pergunta | Resposta |
| --- | --- |
| O PDV esta vendavel? | Sim, com ressalvas operacionais. Bloqueio sem caixa e finalizacao com caixa estao implementados no backend e UI. |
| O Caixa esta vendavel? | Sim. Abertura, fechamento, historico, movimentos e totalizadores existem. Foi corrigido o calculo de saldo esperado em dinheiro. |
| Delivery pelo PDV esta vendavel? | Sim, com ressalva de geocoding quando a regra exigir lat/lng. Cliente/endereco sao obrigatorios e frete e recalculado no backend. |
| Fluxo PDV -> Pedido -> Caixa -> KDS esta confiavel? | Sim no caminho de codigo auditado: venda PDV chama movimento de caixa e `updateOrderStatus`, que aciona KDS. |
| Pode ser demonstrado para cliente? | Sim, para demo controlada. Antes de producao assistida, executar checklist visual A-F em ambiente real. |

## 3. Bugs encontrados e corrigidos

| Area | Bug | Causa raiz | Correcao | Status |
| ---- | --- | ---------- | -------- | ------ |
| Caixa | Fechamento calculava saldo esperado somando vendas PIX/cartao como dinheiro fisico. | `CashService.calculateExpectedAmount` somava todo movimento `sale`, sem filtrar `paymentMethod`. | `apps/api/src/cash/cash.service.ts` agora soma no saldo esperado apenas abertura, venda em dinheiro, suprimento, sangria e estorno. Totalizadores por PIX/cartao continuam separados. | Corrigido |
| Typecheck | `pnpm typecheck` nao existia na raiz. | Ausencia de script agregador real. | Adicionado script raiz que executa `tsc --noEmit` para API, web-tenant, web-admin, web-delivery e web-storefront. | Corrigido |
| Prisma validate | `pnpm prisma validate` nao existia na raiz. | Comando era apenas do contexto da API. | Adicionado `pnpm prisma:validate` na raiz, apontando para `apps/api`. | Corrigido |
| web-delivery | Novo `typecheck` revelou `ImportMeta.env` sem tipos Vite. | `tsconfig.json` nao declarava `types: ["vite/client"]`. | Adicionado tipo Vite em `apps/web-delivery/tsconfig.json`. | Corrigido |

## 4. Testes manuais A-F

| Cenario | Resultado | Evidencia | Observacao |
| ------- | --------- | --------- | ---------- |
| A - Caixa fechado bloqueia PDV | Parcial aprovado por codigo | `PosService.createSale` busca caixa aberto por `tenantId`, `operatorId`, `status: open` e lanca erro claro; `PosPage` mostra "Abra o caixa para iniciar vendas no PDV". | Validacao visual completa nao executada em navegador. |
| B - Caixa aberto + venda balcao | Parcial aprovado por codigo | Venda usa `cashSessionId`, registra `sale`, chama `OrdersService.updateOrderStatus`. | Fluxo real precisa ser reexecutado em ambiente operacional. |
| C - Delivery com frete real | Parcial aprovado por codigo | UI chama `/delivery/rates/calculate-current`; backend chama `DeliveryRateService.calculateDeliveryFee` antes de criar pedido. | Se cobertura exigir lat/lng, PDV ainda depende de geocoding. |
| D - Delivery sem dados obrigatorios | Parcial aprovado por codigo | Backend exige cliente, telefone, rua, numero e bairro; UI bloqueia calculo/finalizacao sem dados. | Mensagens sao claras, mas sem teste visual completo. |
| E - Retirada/pickup | Parcial aprovado por codigo | `normalizeDeliveryAddress` so exige endereco para `delivery`; frete retorna 0 fora de delivery. | Confirmar em operacao real. |
| F - Fechamento com divergencia | Aprovado por codigo/build | Corrigido saldo esperado para dinheiro fisico; fechamento salva `closingDifference`. | Revalidar em UI com dinheiro + PIX + credito + debito. |
| Multi-tenant | Parcial aprovado por codigo | Queries auditadas usam `tenantId` em POS, Cash, Orders e KDS. | Sem teste e2e com Tenant A/B nesta rodada. |
| RBAC | Parcial aprovado por codigo | Controllers usam `@RequirePermissions` para `cash.open`, `cash.close`, `cash.add_supply`, `cash.add_withdrawal`, `cash.read`, `pos.create_sale`, `pos.read`, `kds.use`. | Frontend protege rotas principais; granularidade visual de botoes ainda merece QA. |

## 5. Testes automatizados

| Teste | Status | Observacao |
| ----- | ------ | ---------- |
| `pnpm typecheck` | PASSOU | Script criado e executado com sucesso. |
| `pnpm prisma:validate` | PASSOU | Schema Prisma valido. |
| `pnpm --filter @gestor/api build` | PASSOU | Build NestJS verde apos correcao. |
| `pnpm --filter @gestor/web-tenant build` | PASSOU | Build Vite verde; alerta apenas chunk grande. |
| `pnpm --filter @gestor/web-delivery build` | PASSOU | Validou ajuste de `vite/client`. |
| Testes unit/e2e POS/Cash | NAO EXECUTADO | Nao ha script `test` real nos pacotes para estes cenarios. |

## 6. Scripts e comandos

| Comando | Status | Observacao |
| ------- | ------ | ---------- |
| `pnpm build` | Existente | Build agregado ja existia na raiz. |
| `pnpm build:api` | Existente | Build API via filtro. |
| `pnpm build:web-tenant` | Existente | Build web-tenant via filtro. |
| `pnpm lint` | Existente | Agregado real; nao mascara erros. |
| `pnpm typecheck` | Criado e PASSOU | Verifica API, web-tenant, web-admin, web-delivery e web-storefront. |
| `pnpm prisma:validate` | Criado e PASSOU | Executa `prisma validate` no contexto da API. |
| `pnpm test` | Nao criado | Nao existe runner/script real de teste; criar comando placebo seria enganoso. |
| `pnpm check:no-any` | FALHOU | 44 ocorrencias preexistentes fora dos arquivos desta rodada. |

## 7. Lint/typecheck

| App | Resultado | Erros da rodada? | Preexistente? | Bloqueia MVP? |
| --- | --------- | ---------------: | ------------: | ------------: |
| API build | PASSOU | Nao | Nao | Nao |
| web-tenant build | PASSOU | Nao | Nao | Nao |
| web-delivery build | PASSOU | Nao | Nao | Nao |
| typecheck raiz | PASSOU | Nao | Nao | Nao |
| Prisma validate | PASSOU | Nao | Nao | Nao |
| API lint | FALHOU com 41 erros | Nao observado | Sim | Nao para demo; sim para qualidade de release |
| web-tenant lint | FALHOU com 16 erros e 10 warnings | Nao observado | Sim | Nao para demo; sim para qualidade de release |
| check:no-any | FALHOU com 44 ocorrencias | Nao observado | Sim | Sim para criterio estrito de hardening |

## 8. RBAC e multi-tenant

Permissoes testadas por auditoria de codigo:

- `cash.open` para abertura.
- `cash.close` para fechamento.
- `cash.add_supply` e `cash.add_withdrawal` para suprimento/sangria.
- `cash.read` para sessao atual, historico e detalhe.
- `pos.create_sale` para finalizar venda.
- `pos.read` para consultar PDV.
- `kds.use` para KDS.
- `orders.use_kanban` e `orders.update_status` no fluxo operacional de pedidos.

Isolamento validado por auditoria de codigo: POS, Cash, Orders e KDS usam `tenantId` nas consultas principais e na criacao de registros. Risco restante: falta teste e2e Tenant A/Tenant B em banco real.

## 9. Pendencias restantes

### Bloqueadores para MVP vendavel

- Executar contraprova operacional A-F em ambiente real com usuario tenant, navegador e banco de dados.
- Resolver ou aceitar formalmente o `check:no-any` vermelho, pois a regra do projeto exige zero regressao de `any`.

### Importantes para producao

- Corrigir lint API e web-tenant ou registrar baseline formal.
- Adicionar runner/testes automatizados reais para POS/Cash.
- Criar e2e multi-tenant para caixa, pedidos, KDS e Kanban.
- QA visual do fluxo PDV/Caixa apos fechamento e reabertura.
- Geocoding no PDV quando `DeliveryCoverageConfig` exigir lat/lng.
- Revisar ocultacao/desabilitacao frontend para RBAC granular de sangria/suprimento/fechamento.

### Pos-MVP / Premium

- Cadastro rapido dedicado de cliente/endereco no PDV, reaproveitando CRM.
- Busca/enriquecimento por telefone com persistencia de endereco, se o modelo/endpoints forem suficientes.
- Polimento operacional de KDS, impressao e UX de caixa.

## 10. Proximo passo recomendado

Como a Rodada 2.1 passou com ressalvas, recomendo avancar para:

**Rodada 3 - Polimento operacional e cadastro rapido de cliente/endereco no PDV, geocoding quando necessario, permissoes granulares e QA visual.**

Antes disso, execute a contraprova visual A-F em ambiente real para transformar os itens "parcial aprovado por codigo" em evidencia operacional completa.

