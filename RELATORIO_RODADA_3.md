# Relatorio Rodada 3 - PDV Profissional de Atendimento Telefonico

Data: 2026-06-02

## 1. Resumo executivo

| Pergunta | Resposta |
| --- | --- |
| O PDV agora esta profissional para atendimento telefonico? | Sim, no fluxo implementado: busca cliente, selecao, endereco salvo/novo, calculo de frete e finalizacao foram integrados ao PDV existente. |
| Da para buscar cliente? | Sim, por telefone ou nome em `GET /crm/customers/search?q=` com limite e tenantId. |
| Da para cadastrar cliente? | Sim, via `POST /crm/customers`, com telefone normalizado e protecao contra duplicidade. |
| Da para salvar endereco? | Sim, via `POST /crm/customers/:id/addresses`. |
| Da para selecionar endereco salvo? | Sim, o PDV lista enderecos salvos e preenche o snapshot do pedido. |
| O frete calcula corretamente? | Sim pelo endpoint existente `/delivery/rates/calculate-current`; selecao de endereco dispara calculo e finalizacao recalcula no backend. |
| O pedido sai completo? | Sim no caminho de codigo: payload envia `customerId`, `selectedAddressId`, cliente, telefone, snapshot de endereco e frete; backend valida caixa, cliente, endereco, frete, caixa e status central. |

Ressalva: os cenarios manuais A-F em navegador com dados reais ainda precisam ser executados.

## 2. Auditoria curta antes/depois

| Area | Existe hoje | Status | Reaproveitar | Falta |
| ---- | ----------: | ------ | ------------ | ----- |
| Cliente/CRM | Sim | Expandido | `Customer`, `CustomerService`, `/crm/customers`, RBAC `crm.read`/`crm.manage_customers` | QA operacional com base real |
| Enderecos | Parcial | Expandido | `OrderDeliveryAddress` mantido como snapshot | Criado `CustomerAddress` para enderecos salvos |
| PDV atual | Sim | Expandido | `PosPage.tsx`, `useCreatePosSale`, `PosService` | QA visual em tablet/notebook |
| Frete | Sim | Reaproveitado | `DeliveryRateService`, `/delivery/rates/calculate-current` | Geocoding automatico se regra exigir lat/lng e endereco nao tiver coordenadas |
| Caixa/Pedido/KDS | Sim | Preservado | `CashService`, `OrdersService.updateOrderStatus`, KDS | Nenhum fluxo paralelo criado |

## 3. O que foi reaproveitado

| Area | Reaproveitado | Motivo |
| ---- | ------------- | ------ |
| PDV | `apps/web-tenant/src/features/pos/PosPage.tsx` | Mantem tela e fluxo existentes. |
| POS backend | `PosService` e `CreatePosOrderDTO` | Evita fluxo paralelo de pedido. |
| Caixa | `CashService.registerSaleMovement` | Venda continua vinculada ao caixa. |
| Pedido | `OrdersService.updateOrderStatus` | Mantem timeline/WebSocket/KDS/Kanban. |
| Frete | `DeliveryRateService` e `/delivery/rates/calculate-current` | Frete nao e calculado no frontend. |
| CRM | `Customer`, `CustomerService`, controller CRM | Evita cadastro paralelo. |
| Snapshot | `OrderDeliveryAddress` | Pedido antigo nao depende do endereco vivo do cliente. |

## 4. Arquivos alterados

| Arquivo | Alteracao | Motivo |
| ------- | --------- | ------ |
| `apps/api/prisma/schema.prisma` | Adicionado `CustomerAddress` e relacoes em `Tenant`/`Customer`. | Persistir multiplos enderecos por cliente. |
| `apps/api/prisma/migrations/20260602090000_customer_addresses/migration.sql` | Migration da tabela `customer_addresses`. | Impacto controlado no banco. |
| `packages/types/src/customer.ts` | DTOs de cliente/endereco e retorno de busca. | Tipagem compartilhada forte. |
| `packages/types/src/pos.ts` | `customerId` e `selectedAddressId` no payload PDV. | Vincular cliente/endereco salvo ao pedido. |
| `apps/api/src/crm/customer.service.ts` | Busca, cadastro, CRUD de enderecos, normalizacao de telefone. | CRM operacional para PDV. |
| `apps/api/src/crm/customer.controller.ts` | Novas rotas CRM/endereco. | Expor backend para o PDV com RBAC. |
| `apps/api/src/pos/pos.service.ts` | Valida `customerId`/`selectedAddressId` por tenant e usa endereco salvo como snapshot. | Finalizacao completa sem fluxo paralelo. |
| `apps/web-tenant/src/features/pos/hooks/usePosSale.ts` | Payload aceita cliente/endereco salvo e lat/lng. | Enviar dados corretos ao backend. |
| `apps/web-tenant/src/features/pos/PosPage.tsx` | Painel profissional de cliente/endereco/frete. | Atendimento telefonico real no PDV. |

## 5. Models/migrations

Foi criado o model `CustomerAddress`.

O model `OrderDeliveryAddress` foi mantido como snapshot do pedido. Isso preserva historico mesmo se o endereco salvo do cliente for editado ou removido depois.

Migration criada:

- `apps/api/prisma/migrations/20260602090000_customer_addresses/migration.sql`

Impacto: cria tabela `customer_addresses`, indices por `tenant_id` e `customer_id`, e FKs para `customers` e `tenants` com cascade.

## 6. Endpoints criados/alterados

| Metodo | Rota | Funcao | RBAC |
| ------ | ---- | ------ | ---- |
| `GET` | `/crm/customers/search?q=&limit=` | Buscar cliente por nome/telefone com enderecos resumidos. | `crm.read` ou `crm.manage_customers` |
| `POST` | `/crm/customers` | Cadastro rapido de cliente. | `crm.manage_customers` |
| `GET` | `/crm/customers/:id/addresses` | Listar enderecos salvos. | `crm.read` ou `crm.manage_customers` |
| `POST` | `/crm/customers/:id/addresses` | Criar endereco salvo. | `crm.manage_customers` |
| `PATCH` | `/crm/customers/:id/addresses/:addressId` | Editar endereco salvo. | `crm.manage_customers` |
| `DELETE` | `/crm/customers/:id/addresses/:addressId` | Remover endereco salvo sem afetar snapshots antigos. | `crm.manage_customers` |
| `POST` | `/pos/sales` | Aceita `customerId` e `selectedAddressId`; valida tenant e recalcula frete. | `pos.create_sale` |

## 7. Fluxo antes/depois

### Antes

PDV simples, com campos manuais de cliente/endereco e busca local improvisada em `/crm/customers`.

### Depois

PDV permite atendimento telefonico real:

1. operador digita telefone ou nome;
2. autocomplete busca no backend por tenant;
3. operador seleciona cliente;
4. enderecos salvos aparecem;
5. selecionar endereco preenche snapshot e calcula frete;
6. operador pode cadastrar cliente novo e salvar endereco;
7. frete aparece no painel e no resumo;
8. finalizacao envia cliente/endereco e backend recalcula.

## 8. Resultado dos testes manuais

| Cenario | Status | Observacao |
| ------- | ------ | ---------- |
| A - Cliente existente por telefone | Nao executado em navegador | Implementado por codigo e typecheck/build verde. |
| B - Cliente existente por nome | Nao executado em navegador | Endpoint busca por `name contains`. |
| C - Cliente novo por telefone | Nao executado em navegador | Cadastro rapido implementado; duplicidade por telefone bloqueada. |
| D - Multiplos enderecos | Nao executado em navegador | Lista/seleciona enderecos e recalcula frete. |
| E - Delivery sem endereco | Parcial por codigo | UI/backend bloqueiam dados obrigatorios. |
| F - Balcao/retirada | Parcial por codigo | Frete zera fora de delivery. |

## 9. Resultado dos comandos

| Comando | Status | Observacao |
| ------- | ------ | ---------- |
| `pnpm -C apps/api prisma:generate` | PASSOU | Prisma Client atualizado para `CustomerAddress`. |
| `pnpm prisma:validate` | PASSOU | Schema valido. |
| `pnpm typecheck` | PASSOU | API e frontends tipados. |
| `pnpm --filter @gestor/api build` | PASSOU | Build NestJS verde. |
| `pnpm --filter @gestor/web-tenant build` | PASSOU | Build Vite verde; alerta de chunk grande preexistente. |
| `pnpm --filter @gestor/web-delivery build` | PASSOU | Build verde. |
| `pnpm --filter @gestor/api lint` | FALHOU | 41 erros preexistentes; nenhum em arquivos alterados nesta rodada. |
| `pnpm --filter @gestor/web-tenant lint` | FALHOU | 16 erros e 10 warnings preexistentes; nenhum em `PosPage.tsx` alterado nesta rodada. |
| `pnpm check:no-any` | FALHOU | 44 ocorrencias preexistentes; nenhum arquivo novo/alterado desta rodada apareceu na lista. |

## 10. Divida tecnica

| Item | Antes | Depois | Regressao? |
| ---- | ----: | -----: | ---------: |
| Lint API | 41 erros | 41 erros | Nao |
| Lint web-tenant | 16 erros / 10 warnings | 16 erros / 10 warnings | Nao |
| `check:no-any` | 44 ocorrencias | 44 ocorrencias | Nao |

Arquivos novos/alterados nesta rodada sem `any` reportado pelo checker.

## 11. Pendencias restantes

### Bloqueadores para MVP vendavel

- Executar cenarios manuais A-F em ambiente real com caixa aberto, produtos, cliente/endereco e regra de frete configurada.
- Aplicar migration no banco de ambiente alvo antes de demonstrar cadastro de enderecos.

### Importantes para producao

- Resolver ou baselinear lint API/web-tenant e `check:no-any`.
- Adicionar testes automatizados reais para CRM/endereco/POS.
- QA visual em notebook, tablet e mobile.
- Melhorar erro de geocoding quando regra de cobertura exigir lat/lng e endereco salvo nao tiver coordenadas.

### Pos-MVP / Premium

- Historico visual de ultimos pedidos do cliente no painel do PDV.
- Geocoding/mapa embutido para localizar endereco pelo operador.
- Endereco favorito por tipo de entrega, tags e observacoes avancadas.

## 12. Veredito

**IMPLEMENTADO COM RESSALVAS**

O criterio funcional de codigo foi atendido sem criar outro PDV, outro CRM, outro caixa, outro fluxo de pedido ou outra engine de frete. A rodada so deve ser considerada operacionalmente concluida depois da validacao manual A-F em ambiente real.

