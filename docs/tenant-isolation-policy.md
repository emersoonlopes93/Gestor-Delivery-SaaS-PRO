# Tenant Isolation Policy

Politica obrigatoria para dados multi-tenant.

## Regra Base

Todo dado operacional de tenant deve ser consultado, criado, atualizado e removido com `tenantId`.

Rotas tenant devem usar:

- `TenantAuthGuard`
- `PermissionsGuard`
- `@RequirePermissions(...)`
- `@CurrentTenant()` ou `request.user.tenantId`

Services tenant devem receber `tenantId` explicitamente ou usar `prisma.tenantClient` dentro do contexto tenant.

## Modelos Globais Permitidos

Modelos globais podem ser acessados sem `tenantId` somente quando representam configuracao SaaS ou catalogo global:

- `Tenant`
- `BusinessGroup`
- `AdminUser`
- `AdminRole`
- `AdminPermission`
- `Plan`
- `BillingPlan`
- `BillingRevenueTier`
- `BillingPlanModule`
- `BillingModuleAddon`
- `BillingSettings`
- `SystemConfig`

## Modelos Mistos

`MediaAsset` e `MediaCategory` sao modelos mistos:

- `tenantId != null` e `scope='tenant_library'`: privado do tenant.
- `tenantId == null`, `scope='system_gallery'`, `isSystem=true`, `publicationStatus='published'`: galeria global publica para tenants.

Qualquer consulta tenant a midia deve usar uma condicao `OR` explicita que permita apenas:

- midia do proprio tenant; ou
- midia global publicada e ativa.

## Billing

Billing admin pode consultar todos os tenants, mas qualquer operacao financeira de tenant deve registrar:

- `tenantId`
- ciclo ou invoice relacionado
- status anterior e proximo status
- motivo
- usuario/admin/sistema responsavel

Snapshots de uso fechados nao podem ser recalculados.

## Logs De Bloqueio

Tentativas de acessar recursos privados de outro tenant devem:

- retornar `404` ou `403` sem revelar existencia do recurso;
- registrar log estruturado com `tenantId`, recurso e id solicitado;
- nunca retornar dados parciais do recurso bloqueado.

## Checklist Para Novo Controller Tenant

- Controller usa `@UseGuards(TenantAuthGuard, PermissionsGuard)`.
- Toda rota sensivel tem `@RequirePermissions`.
- Service recebe `tenantId`.
- Queries usam `where: { tenantId, ... }`.
- Updates/deletes validam pertencimento antes da mutacao.
- Teste cobre acesso negado a recurso de outro tenant quando aplicavel.
