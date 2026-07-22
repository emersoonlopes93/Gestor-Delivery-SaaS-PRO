---
title: Matriz de Funcionalidades
status: current
owner: product
last_verified: 2026-07-16
verified_against: release/ifood-staging-rc
source_of_truth:
  - packages/core/src/constants/features.ts
---

# Matriz de Funcionalidades (Feature Matrix)

> Esta matriz reflete o estado exato do catálogo de features configurado no código.
> As permissões são gerenciadas por RBAC (Role-Based Access Control).
> Consulte `packages/core/src/constants/features.ts` para a definição canônica.

---

## Legenda de Status

- **Stable**: Funcionalidade completa, testada e em uso por tenants reais. Pode ser ativada com segurança.
- **Beta**: Funcionalidade implementada mas sujeita a mudanças, instabilidades ou requisitos incompletos.
- **Coming Soon**: Planejado ou em desenvolvimento ativo (código pode estar presente mas não é funcional).
- **Stub**: Declarado mas sem implementação real de persistência ou lógica (verificado via código).

---

## 1. Módulos Core (Sempre habilitados)

| Funcionalidade | Módulo | Descrição |
|---------------|---------|-----------|
| Autenticação Multi-Identidade | Core | Suporte a TenantUser, Customer, Driver e Admin. |
| Isolamento Multi-Tenant | Core | Isolamento estrito de dados por loja ou rede. |
| Autorização (RBAC) | Core | Roles, permissões e guards de acesso. |
| Sessões Ativas | Core | Controle de sessões via banco (revogação, dispositivos). |
| Painel SaaS Admin | Admin | Governança da plataforma por super administradores. |
| Registro de Auditoria | Core | Logs imutáveis de ações críticas. |

---

## 2. Operações de Pedido (Orders)

| Feature Key | Status | Descrição | Permissão requerida |
|-------------|--------|-----------|--------------------|
| `orders_core` | **Stable** | Gestão de pedidos e checkout base. | N/A (Core) |
| `checkout_core` | **Stable** | Finalização de pedidos. | N/A (Core) |
| `marketplace_orders` | **Beta** | Inbox idempotente, ordenação, reconciliação, divergências, SLA e reprocessamento controlado de pedidos externos. | `orders.read` |
| `kds` | **Beta** | Painel de produção com estações, consulta tenant-safe de jobs, atualização de status e polling de fallback. | `kds.use` |
| `printing` | **Beta** | Jobs tenant-safe, reimpressão manual, retry limitado, spooler opcional e fallback pelo navegador (`window.print`). | `printing.read` |
| `scheduling` | **Beta** | Janelas tenant-safe, slots com timezone/capacidade e checkout transacional; edição de horário exige cancelar e reagendar. | `scheduling.view` |
| `split_payment` | **Stub** | Divisão de pagamentos. | N/A |

---

## 3. Catálogo e Produtos (Catalog)

| Feature Key | Status | Descrição | Permissão requerida |
|-------------|--------|-----------|--------------------|
| `catalog_core` | **Stable** | Produtos, categorias, opções e combos base. | N/A (Core) |
| `pizza_template` | **Beta** | Fluxos complexos para meias-pizzas e bordas. | `catalog.read` |
| `base_menus` | **Stable** | Clonagem de cardápios base do SaaS. | `catalog.create` |
| `base_media` | **Stable** | Galeria de mídias compartilhada. | `catalog.update` |
| `upsells` | **Beta** | Sugestões de compra casada e adicionais. | `catalog.read` |

---

## 4. Entrega e Logística (Delivery)

| Feature Key | Status | Descrição | Permissão requerida |
|-------------|--------|-----------|--------------------|
| `delivery_radius` | **Stable** | Entrega por raio de distância e km. | `delivery.manage` |
| `delivery_zones_advanced`| **Beta** | Polígonos de entrega desenhados no mapa. | `delivery.manage` |
| `delivery_live_map` | **Beta** | Rastreamento de entregadores ao vivo. | `delivery.read` |
| `delivery_neighborhood` | **Coming Soon**| Taxas fixas por bairro cadastrado. | `delivery.manage` |

---

## 5. PDV e Salão (Operations)

| Feature Key | Status | Descrição | Permissão requerida |
|-------------|--------|-----------|--------------------|
| `pos` | **Stable** | Ponto de venda com sessão de caixa obrigatória, pagamento, idempotência por chave e impressão de cupom. | `pos.read` |
| `dine_in` | **Beta** | Gestão de mesas e comandas; pedidos novos usam relação `tableId` com snapshot `tableNumber` compatível. | `pos.read` |

---

## 6. CRM, Marketing e Relacionamento

| Feature Key | Status | Descrição | Permissão requerida |
|-------------|--------|-----------|--------------------|
| `coupons` | **Stable** | Criação e gestão de cupons de desconto. | `crm.manage_coupons` |
| `cashback` | **Beta** | Carteira virtual com % de retorno. | `crm.manage_loyalty_cashback`|
| `loyalty` | **Beta** | Programa de selos e fidelização. | `crm.manage_loyalty_cashback`|
| `crm_enterprise` | **Beta** | Pipeline e segmentação avançada de clientes. | `crm.read` |
| `crm_operational_profile` | **Stable** | Perfil operacional do cliente com contatos, totais, ticket médio, últimos pedidos, endereços e observações internas. | `crm.read` |
| `campaigns` | **Beta** | Disparos automáticos e campanhas (requer Redis). | `crm.read` |
| `whatsapp_connect` | **Beta** | Conexão com API Oficial do WhatsApp. | `settings.manage` |
| `whatsapp_advanced` | **Beta** | Inbox de atendimento humano. | `orders.read` |
| `ai_agent` | **Beta** | Assistente virtual IA (OpenAI/Gemini/Claude). | `settings.manage` |

---

## 7. Retaguarda (Backoffice)

| Feature Key | Status | Descrição | Permissão requerida |
|-------------|--------|-----------|--------------------|
| `inventory_advanced` | **Stable** | Fichas técnicas, insumos e baixa teórica atômica, idempotente e sem saldo negativo. | `inventory.read` |
| `finance_advanced` | **Stable** | DRE simplificado, fluxo de caixa e lançamentos. | `finance.read` |
| `bi_advanced` | **Beta** | Dashboards e cubos de dados customizados. | `reports.read` |
| `goals` | **Beta** | Cadastro e acompanhamento de metas da loja. | `goals.read` |

---

## 8. Canais Externos e Integrações

| Feature Key | Status | Descrição | Entitlement requerido |
|-------------|--------|-----------|-----------------------|
| `storefront_core` | **Stable** | Cardápio público PWA com link próprio. | N/A |
| `ifood_marketplace` | **Beta** | RC de staging com pedidos bidirecionais, reconciliação, polling/ACK por token-device e operação SaaS Admin; homologação iFood pendente e kill switches desligados. Catálogo fora do escopo. | `ifood_integration` |
| `franchise` | **Beta** | Agrupamento de lojas para franqueadoras. | N/A |
| `admin_integrations` | **Beta** | Integrações globais para todo o SaaS. | N/A |

---

## Resolução de Acesso (Feature Control Center)

O acesso a uma funcionalidade é determinado por, em ordem de precedência:
1. `FeatureTenantOverride` (Forçar ativação/desativação manual por loja).
2. `BillingEntitlements` (Planos de assinatura ou add-ons que a loja possui).
3. Status base do `FEATURE_CATALOG` (`stable` ativa por padrão; `beta` não, a menos que sobreposto).
4. Variáveis `VITE_FEATURE_*` (Apenas no frontend, caso os outros falhem).
