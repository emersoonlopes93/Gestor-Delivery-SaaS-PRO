# Contrato — Autorização e RBAC

> **Status:** Estável  
> **Última revisão:** 2026-07-23  
> **Verificado contra:** `main-copy / 78daea7a`

---

## 1. Modelo de autorização

O sistema usa **Role-Based Access Control (RBAC)** com resolução hierárquica:

```
Role → Permissions → Guards → Endpoint
```

Cada `TenantUser` possui um ou mais `Role`s. Cada `Role` tem um conjunto de `Permission`s. Os guards verificam a presença da permissão necessária no token JWT.

---

## 2. Papéis padrão (Roles)

| Role | Descrição |
|------|-----------|
| `owner` | Acesso total ao tenant |
| `manager` | Gerenciamento operacional |
| `staff` | Operação de pedidos e caixa |
| `delivery` | Operação de entrega |
| `kitchen` | KDS e produção |

---

## 3. Categorias de permissão

| Prefixo | Domínio |
|---------|---------|
| `orders.*` | Pedidos e checkout |
| `catalog.*` | Produtos e categorias |
| `delivery.*` | Configuração de entrega |
| `crm.*` | Clientes e CRM |
| `finance.*` | Financeiro e relatórios |
| `reports.*` | Relatórios e analytics |
| `settings.*` | Configurações do tenant |
| `pos.*` | Ponto de venda |
| `kds.*` | Kitchen Display System |
| `printing.*` | Impressão |
| `inventory.*` | Estoque |
| `goals.*` | Metas gerenciais |
| `scheduling.*` | Agendamentos |
| `billing.*` | Billing e assinatura |

---

## 4. Guards e decorators

### `TenantAuthGuard`

Valida o JWT do `TenantUser`. Rejeita com 401 se token inválido ou sessão revogada.

### `PermissionsGuard`

Verifica se o usuário possui a permissão declarada via `@RequirePermissions()`.

```typescript
// Uso típico
@RequirePermissions('orders.read')
@UseGuards(TenantAuthGuard, PermissionsGuard)
async listOrders() { ... }
```

### `AdminAuthGuard` + `AdminPermissionsGuard`

Equivalente para `AdminUser`. Permissões prefixadas com `saas.*`.

---

## 5. Resolução de permissão para features

O acesso a uma **feature** (não uma permissão RBAC) é determinado por:

1. `FeatureTenantOverride` — override manual por loja (banco)
2. `BillingEntitlements` — plano de assinatura da loja
3. Status no `FEATURE_CATALOG` (`stable` = ativo por padrão)
4. Variáveis `VITE_FEATURE_*` — apenas no frontend como fallback

---

## 6. Regras inegociáveis

- **Nunca** confiar em dados de permissão enviados no body — usar apenas o JWT.
- **Nunca** ignorar autorização por ocultação de UI.
- **Nunca** criar endpoint admin sem `AdminAuthGuard` + `AdminPermissionsGuard`.
- Queries de dados operacionais devem **sempre** incluir `tenantId` do JWT.

---

## 7. Referências

- Guards: `apps/api/src/auth/guards/`, `apps/api/src/rbac/guards/`
- Decorator: `apps/api/src/common/decorators/require-permissions.decorator.ts`
- Módulo: `apps/api/src/rbac/rbac.module.ts`
- Catálogo de features: `packages/core/src/constants/features.ts`
