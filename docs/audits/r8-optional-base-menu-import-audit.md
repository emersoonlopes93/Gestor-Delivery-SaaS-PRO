# R8 - optional and durable base menu import

Date: 2026-08-03

## Audit result

- Source: published `BaseMenuTemplate` and `BaseMenuTemplateVersion` rows.
- Tenant endpoint: `POST /catalog/menu-import/execute` guarded by tenant auth, RBAC `catalog.create`, and the canonical `baseMenu.import` action capability.
- Manual surfaces: onboarding product step and `/settings/menu-import`.
- No tenant creation, onboarding completion, first-login, settings-save, job, or background automatic import trigger was found.
- The previous import wrote categories and products incrementally, allowed partial results, and used human names/slugs as best-effort duplicate checks.
- Historical `BaseMenuImportLog` rows have no durable operation identity and are not reinterpreted.

## R8 contract

- `BaseMenuImportLog.operationKey` is nullable and unique. New keys are calculated server-side as `tenantId + templateVersionId`; historical rows remain `NULL`.
- A new import runs inside one Serializable transaction. The operation claim, empty-catalog preflight, categories, products, publications, option groups/items/links, media references, prices, and successful log completion commit together.
- Any error escapes the operation and rolls back the complete transaction. New R8 operations never finish as `partial`.
- A completed equivalent operation returns its stored result without writes. The operation-key constraint arbitrates concurrent calls; only its specific P2002 is recovered.
- A tenant with an existing category or product and no equivalent completed operation receives HTTP 409 with `BASE_MENU_IMPORT_REQUIRES_EMPTY_CATALOG`. No merge, overwrite, deletion, or name-based deduplication is attempted.
- `businessSegment` is independent. Template selection and import do not update it.

## Capability and release policy

`packages/core/src/constants/tenant-action-capabilities.ts` defines `baseMenu.import` as OFF for the initial Go-Live. `FeatureControlService` is the server source of truth exposed by `/tenant/capabilities`.

The same API and UX contract can be reactivated by setting the API runtime variable `BASE_MENU_IMPORT_ENABLED=true`. Its validated default is `false`; no schema or admin UI is needed for reactivation.

When OFF, the POST returns HTTP 403 with `BASE_MENU_IMPORT_DISABLED` before invoking the import service. Onboarding, settings, and the empty-products surface hide import entry points and do not mount/fetch the template picker. Direct navigation shows an unavailable state and links to manual product creation.

## Data safety

The migration only adds a nullable column and unique index. It contains no backfill, `UPDATE`, `DROP`, destructive rename, or historical-log rewrite. Disabling the capability does not modify existing categories, products, media, logs, storefront data, or `businessSegment`.

Production migration and deployment are outside R8.
