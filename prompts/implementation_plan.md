# Audit and Stabilization Plan — Phase 9 Regressions

This plan addresses the critical build failures and API runtime errors identified during the technical audit.

## Problem Classification

| Category | Issue | Root Cause |
| --- | --- | --- |
| **TypeScript** | Decorator signature mismatch in Storefront | Missing `experimentalDecorators` in app-level tsconfig; TS 5.0+ defaults to Stage 3 decorators which are incompatible with legacy `class-validator`. |
| **Build Configuration** | Stale API compilation errors & Storefront build failure | Inconsistent inheritance from [tsconfig.base.json](file:///c:/Users/emers/Documents/GitHub/Gestor%20Delivery%20SaaS%20PRO/tsconfig.base.json) in apps; combined with stale [.tsbuildinfo](file:///c:/Users/emers/Documents/GitHub/Gestor%20Delivery%20SaaS%20PRO/apps/api/tsconfig.tsbuildinfo) files. |
| **Runtime (API)** | `MODULE_NOT_FOUND` for `ts-node` | Corrupted `node_modules` in `apps/api` (likely failed pnpm installation) preventing `ts-node-dev` from starting. |
| **Backend Code** | Missing `JwtAuthGuard` | Regressive imports referencing a non-existent file; core controllers should use `TenantAuthGuard`. |

## Proposed Changes

### [Component] Shared Types (`packages/types`)
- [x] Consolidate all domain enums to ensure value visibility.
- [x] Fix `isolatedModules` re-export strategy in `index.ts`.

### [Component] Web Apps (`web-storefront`, `web-tenant`)
- [MODIFY] `apps/web-storefront/tsconfig.app.json`: Enable `experimentalDecorators` and `emitDecoratorMetadata`.
- [MODIFY] `apps/web-storefront/tsconfig.node.json`: Remove stale `node` type reference to bypass missing `@types/node` in app scope.
- [MODIFY] `apps/web-tenant/tsconfig.json`: Add `experimentalDecorators` and `emitDecoratorMetadata`.

### [Component] Backend (`apps/api`)
- [FIX] `apps/api/src/common/guards/jwt-auth.guard.ts`: [NEW] Re-create a standard JwtAuthGuard or alias to `TenantAuthGuard` to satisfy legacy imports.
- [FIX] `apps/api/src/inventory/*.controller.ts`: Update imports to use `TenantAuthGuard` if appropriate for consistency.
- [FIX] `apps/api/node_modules`: Surgical re-installation of `ts-node` if corruption persists. (Attempt `pnpm install --no-frozen-lockfile`).

## Verification Plan
1. `npx turbo run build --no-cache`
2. `pnpm dev:api`
3. Manual smoke test of `/inventory` page in `web-tenant`.
