# Plano Mestre de Desenvolvimento — Gestor Delivery SaaS

## 1. Visão do Produto

### Objetivo
Construir um sistema completo de gestão de delivery para restaurantes, pizzarias, açaiterias, sushis e similares, com foco principal na **operação da loja** e uma camada **SaaS Admin** usada para orquestração, billing, suporte, governança e gestão multi-tenant.

### Princípios do Produto
- O núcleo do produto é a **gestão operacional do delivery**.
- O **SaaS Admin não é o produto principal**, e sim a camada de controle e orquestração.
- O sistema deve ser **multi-tenant** desde a base.
- Deve existir **RBAC tanto no painel da loja quanto no SaaS Admin**.
- O desenvolvimento deve seguir uma abordagem **modular e incremental**, evitando tentar construir tudo de uma vez.

### Perfis de uso

#### Operação da loja
- Dono
- Gerente
- Atendente
- Operador de PDV
- Cozinha / KDS
- Expedidor
- Financeiro
- Marketing / CRM
- Entregador

#### SaaS Admin
- Super Admin
- Suporte
- Financeiro
- Comercial
- Customer Success / Onboarding
- Operações Internas
- Auditoria / Compliance

---

## 2. Macroestrutura do Produto

### Camada 1 — Operação da Loja
Módulos principais:
- Dashboard operacional
- Gestor de pedidos
- Kanban de pedidos
- PDV
- KDS
- Gestão de entregadores
- Rastreio
- Caixa
- Relatórios
- Estoque
- CRM
- Metas
- Cardápio
- Cupons / cashback / fidelidade

### Camada 2 — Experiência do Cliente Final
Módulos principais:
- Cardápio digital online
- Checkout
- Combos
- Complementos
- Cupons
- Cashback
- Fidelidade
- Rastreamento do pedido
- Área de retirada / entrega

### Camada 3 — SaaS Admin
Módulos principais:
- Gestão de tenants
- Planos
- Assinaturas
- Billing
- Feature flags
- Módulos ativos por tenant
- Limites por plano
- Suporte
- Financeiro SaaS
- Métricas por tenant
- Auditoria
- Onboarding
- RBAC interno do SaaS Admin

---

## 3. Stack Recomendada

### Monorepo
- PNPM Workspaces ou Turborepo

### Frontend Web
- React
- TypeScript
- Vite
- TanStack Query
- Zustand
- React Hook Form
- Zod
- Tailwind CSS
- shadcn/ui

### Mobile
Estratégia recomendada:
- Início com **web responsivo forte**
- Evolução com **Capacitor** para reaproveitar a base

Apps mobile prioritários:
- app do entregador
- app operacional leve (opcional depois)

### Backend
- NestJS
- Prisma
- PostgreSQL
- Redis
- BullMQ
- WebSocket ou SSE para eventos em tempo real

### Infraestrutura
- Docker
- Storage S3 compatível
- Logs estruturados
- Métricas
- Auditoria
- Observabilidade básica desde o início

---

## 4. Arquitetura do Monorepo

```txt
apps/
  api/
  web-admin/
  web-tenant/
  web-storefront/
  mobile-driver/
  mobile-ops/

packages/
  ui/
  types/
  core/
  auth/
  config/
  utils/
  eslint-config/
  tsconfig/
```

### Papel de cada app
- `api`: backend principal
- `web-admin`: painel SaaS Admin
- `web-tenant`: painel operacional da loja
- `web-storefront`: cardápio digital / pedido online
- `mobile-driver`: app do entregador
- `mobile-ops`: app operacional opcional para fases futuras

### Papel dos packages
- `ui`: componentes compartilhados
- `types`: contratos tipados compartilhados
- `core`: regras, enums, helpers de domínio
- `auth`: contratos e utilitários de autenticação/autorização
- `config`: configs centrais do projeto
- `utils`: utilitários transversais

---

## 5. Multi-Tenant

### Estratégia recomendada para início
Usar **banco compartilhado com isolamento por `tenant_id`**.

### Regras obrigatórias
- Toda tabela operacional da loja deve possuir `tenant_id`
- Toda query deve filtrar por `tenant_id`
- Índices compostos devem considerar `tenant_id`
- Logs e auditoria devem registrar `tenant_id`
- Cache e eventos também devem respeitar o tenant

### Benefícios
- Menor complexidade inicial
- Menor custo
- Mais compatível com desenvolvimento assistido por IA
- Mais rápido para lançar MVP

### Evolução futura possível
- tenant premium com banco dedicado
- tenant enterprise com isolamento físico

---

## 6. RBAC — Loja e SaaS Admin

## 6.1 RBAC do Tenant (Loja)

### Estrutura recomendada
- users
- roles
- permissions
- role_permissions
- user_roles

### Exemplos de permissões
- `orders.read`
- `orders.update`
- `orders.cancel`
- `catalog.read`
- `catalog.create`
- `catalog.update`
- `cash.open`
- `cash.close`
- `reports.view`
- `crm.manage`
- `delivery.dispatch`
- `kds.use`

### Perfis padrão
- tenant_owner
- manager
- attendant
- pdv_operator
- kitchen_operator
- dispatcher
- financeiro
- marketing
- driver

## 6.2 RBAC do SaaS Admin

### Objetivo
Controlar acesso interno ao painel administrativo da plataforma SaaS.

### Estrutura separada do tenant
O RBAC do SaaS Admin deve ser **separado do RBAC da loja**.
Não misturar permissões da operação com permissões internas do SaaS.

### Exemplos de permissões SaaS Admin
- `saas.tenants.read`
- `saas.tenants.update`
- `saas.plans.manage`
- `saas.billing.read`
- `saas.billing.manage`
- `saas.support.access`
- `saas.support.impersonate` (se existir)
- `saas.audit.read`
- `saas.modules.manage`
- `saas.metrics.read`
- `saas.onboarding.manage`
- `saas.users.manage`

### Perfis SaaS Admin sugeridos
- super_admin
- support_agent
- finance_admin
- sales_admin
- onboarding_admin
- operations_admin
- auditor

### Observação crítica
Se houver função de impersonação/acesso temporário a tenant para suporte:
- registrar auditoria obrigatória
- registrar motivo do acesso
- registrar operador interno
- registrar horário de início/fim

---

## 7. Módulos de Domínio

### 7.1 Identity / Access
- autenticação
- sessão
- usuários
- permissões
- perfis
- auditoria

### 7.2 Tenant / SaaS
- tenant
- plano
- assinatura
- módulos ativos
- limites
- billing
- feature flags

### 7.3 Catálogo / Cardápio
- categorias
- produtos
- variações
- complementos
- grupos de complementos
- combos
- disponibilidade
- horários
- preço por canal

### 7.4 Pedidos
- carrinho
- pedido
- itens
- observações
- status
- timeline
- cancelamentos
- agendamento
- origem do pedido

### 7.5 Produção / KDS
- estações
- fila de preparo
- prioridade
- tempo estimado
- mudança de status

### 7.6 PDV / Caixa
- venda balcão
- retirada
- caixa
- sangria
- suprimento
- fechamento
- conferência

### 7.7 Logística / Delivery
- entregadores
- disponibilidade
- despacho
- rota
- rastreamento
- SLA
- prova de entrega

### 7.8 CRM / Growth
- clientes
- histórico
- segmentação
- cupons
- cashback
- fidelidade
- campanhas

### 7.9 Estoque
- insumos
- ficha técnica
- baixa automática
- movimentação
- perdas
- inventário

### 7.10 Financeiro / Relatórios
- recebimentos
- formas de pagamento
- taxas
- comissões
- relatórios operacionais
- DRE simplificada

### 7.11 Metas / Performance
- metas por período
- metas por canal
- metas por loja
- metas por operador
- metas por entregador

---

## 8. Fluxos Críticos do Produto

### Fluxo 1 — Cadastro e configuração inicial da loja
- criação do tenant
- configuração inicial
- usuários da loja
- módulos habilitados
- cardápio inicial

### Fluxo 2 — Pedido online
- cliente acessa cardápio
- adiciona itens/complementos/combos
- aplica cupom
- escolhe entrega ou retirada
- fecha pedido
- pedido entra na operação

### Fluxo 3 — Operação do pedido
- pedido recebido
- confirmação
- produção
- expedição
- entrega / retirada
- conclusão

### Fluxo 4 — Gestão logística
- fila de pedidos prontos
- despacho para entregador
- rastreamento
- conclusão da entrega

### Fluxo 5 — Fechamento operacional
- caixa
- relatórios
- comissões
- indicadores

---

## 9. Status de Pedido Recomendados

Estrutura simples, robusta e auditável:

- `draft`
- `pending_payment`
- `paid`
- `confirmed`
- `in_preparation`
- `ready_for_dispatch`
- `out_for_delivery`
- `ready_for_pickup`
- `completed`
- `cancelled`

### Regra recomendada
Manter uma **timeline de eventos do pedido** separada da tabela principal, para auditoria e rastreabilidade.

---

## 10. MVP Realista e Vendável

### Incluir no MVP
- multi-tenant
- auth
- RBAC do tenant
- RBAC do SaaS Admin
- dashboard básico
- cardápio
- categorias
- produtos
- complementos
- combos simples
- cardápio online
- checkout
- criação de pedidos
- timeline de pedido
- kanban de pedidos
- KDS
- PDV básico
- caixa básico
- gestão simples de entregadores
- rastreamento simples
- cupons
- relatórios operacionais básicos

### Não incluir no MVP
- roteirização avançada
- BI avançado
- CRM sofisticado
- metas super detalhadas
- estoque muito avançado
- billing complexo demais
- automações de marketing muito profundas

---

## 11. Modelo SaaS de Planos

### Estratégia recomendada
Ter inicialmente **1 plano completo** com preço baseado em **faixa de faturamento bruto mensal**.

### Exemplo
- até R$ 2.000 → R$ 69
- até R$ 5.000 → R$ 99
- até R$ 10.000 → R$ 149
- acima disso → plano superior

### Observação importante
É melhor usar:
- faturamento bruto mensal
ou
- volume de pedidos

Do que usar “lucro”, pois lucro é mais difícil de medir, validar e auditar.

### Evolução futura
- plano único por faixa
- depois plano enterprise
- depois addons opcionais se necessário

---

## 12. Melhor Sequência de Desenvolvimento

## Fase 0 — Planejamento Mestre
Criar antes de codar:
- visão do produto
- arquitetura do monorepo
- domínio e entidades
- roadmap
- prompt mestre para IA

## Fase 1 — Fundação
Objetivo: estabelecer a base correta.

### Entregáveis
- monorepo configurado
- apps e packages base
- auth
- multi-tenant
- RBAC do tenant
- RBAC do SaaS Admin
- Prisma inicial
- contratos compartilhados
- observabilidade básica
- filas/eventos base
- auditoria básica

## Fase 2 — Catálogo
### Entregáveis
- categorias
- produtos
- complementos
- grupos de complementos
- combos simples
- disponibilidade
- horários

## Fase 3 — Pedidos
### Entregáveis
- carrinho
- checkout
- criação de pedido
- status
- timeline
- painel de pedidos
- filtros operacionais

## Fase 4 — KDS e Kanban
### Entregáveis
- estações
- telas de preparo
- fila de produção
- atualização em tempo real
- indicadores básicos de tempo

## Fase 5 — Storefront Online
### Entregáveis
- cardápio digital
- jornada do cliente
- cupons
- observações
- retirada / entrega
- rastreamento simples

## Fase 6 — PDV e Caixa
### Entregáveis
- venda manual
- abertura de caixa
- sangria
- suprimento
- fechamento
- relatórios operacionais básicos

## Fase 7 — Logística de Entrega
### Entregáveis
- cadastro de entregadores
- disponibilidade
- despacho manual
- rastreamento simples
- SLA básico

## Fase 8 — CRM Básico
### Entregáveis
- clientes
- histórico
- cupom
- cashback simples
- fidelidade básica

## Fase 9 — SaaS Admin Completo
### Entregáveis
- gestão de tenants
- planos
- módulos ativos
- limites
- billing inicial
- suporte
- auditoria
- métricas por tenant

## Fase 10 — Avançados
### Entram depois
- roteirização inteligente
- CRM avançado
- BI avançado
- metas avançadas
- automações complexas
- estoque avançado

---

## 13. Métricas do Dashboard Inicial

### Operacionais
- pedidos hoje
- pedidos em aberto
- ticket médio
- tempo médio de preparo
- tempo médio de entrega
- taxa de cancelamento

### Comerciais
- faturamento diário
- faturamento semanal
- canal de origem
- produtos mais vendidos
- clientes recorrentes

### Logísticos
- entregas por entregador
- SLA médio
- atrasos

---

## 14. Como Usar na Ferramenta de IA

### Regra de ouro
A IA **não deve decidir a arquitetura**. Ela deve **executar uma arquitetura já definida**.

### Fluxo ideal de uso
1. enviar este plano mestre
2. pedir estrutura do monorepo
3. pedir fundação técnica
4. pedir um módulo por vez
5. revisar a saída antes do próximo passo

### Nunca pedir
- “crie o sistema inteiro completo”
- “faça tudo de uma vez”

### Sempre pedir
- uma fase por vez
- um módulo por vez
- arquivos criados
- arquivos alterados
- resumo técnico
- impacto da mudança
- pendências

---

## 15. Template de Prompt para IA

```md
Projeto: sistema de gestão de delivery multi-tenant para restaurantes, pizzarias, açaiterias, sushis e similares.

Stack:
- Frontend: React + TypeScript + Vite
- Backend: NestJS + Prisma + PostgreSQL
- Monorepo: PNPM Workspaces ou Turborepo

Diretrizes obrigatórias:
- foco principal é a operação da loja
- SaaS Admin existe para orquestração
- multi-tenant obrigatório com tenant_id
- RBAC do tenant separado do RBAC do SaaS Admin
- tipagem forte com packages compartilhados
- não duplicar regras
- não quebrar contratos existentes
- manter arquitetura modular

Tarefa atual:
[descrever apenas a fase/módulo atual]

Escopo permitido:
[descrever onde pode mexer]

Escopo proibido:
[descrever onde não pode mexer]

Critérios obrigatórios:
- listar arquivos criados
- listar arquivos alterados
- explicar decisões técnicas
- apontar pendências
- não inventar funcionalidades fora do escopo
```

---

## 16. Recomendação Final

A melhor sequência prática para começar é:

1. arquitetura do monorepo
2. fundação técnica
3. multi-tenant
4. RBAC tenant
5. RBAC SaaS Admin
6. catálogo
7. pedidos
8. KDS / kanban
9. storefront
10. PDV / caixa
11. logística
12. CRM
13. SaaS Admin completo

Esse caminho reduz retrabalho, evita caos arquitetural e funciona melhor com ferramentas de IA.
