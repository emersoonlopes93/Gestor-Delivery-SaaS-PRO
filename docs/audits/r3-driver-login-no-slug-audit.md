# AUDIT R3 — Driver login without visible tenant slug

Date: 2026-08-01

Frontend login: `apps/web-delivery/src/pages/LoginPage.tsx`; it currently asks for tenant slug, phone and PIN, then persists access token, refresh token and the tenant-bound driver session in the Zustand auth store.

Current endpoint: `POST /auth/driver/login`, with refresh at `POST /auth/driver/refresh`, logout at `POST /auth/driver/logout`, session restoration at `GET /auth/driver/me`, and driver routes protected by `DriverAuthGuard`.

Current credential: normalized phone plus bcrypt PIN. Drivers have no email or username credential.

Why slug exists: it resolves a tenant before the composite `(tenantId, phone)` driver lookup. It is not required by JWT, refresh, push, REST driver operations or persisted frontend session state.

Driver uniqueness: driver IDs are globally unique, but phone is not globally unique.

Tenant-scoped uniqueness: Prisma and the original migration enforce `@@unique([tenantId, phone])` only.

Multi-tenant driver possible: YES at the credential level. The model has one `DeliveryDriver` row per tenant and no shared driver identity/membership table, so the same normalized phone can exist in several tenants with independent PIN hashes.

Ambiguous credentials possible: YES. The same phone can have multiple active rows; more than one row can also validate the same PIN.

Tenant resolution: query candidate driver rows by normalized phone, active driver, non-null PIN and active/trial tenant; verify the supplied PIN without disclosing candidates; resolve one match directly or issue a short-lived signed selection capability containing only the matched driver IDs. Selection must accept only an ID embedded in that capability.

Session binding: `AuthSession` stores `subjectType=driver`, driver `subjectId`, `tenantId`, `userId` and role. Access JWT contains `sub=driverId`, `tenantId`, `type=driver` and `sid`.

Refresh binding: refresh rotation is persisted by session/family, expects `AuthSubjectType.driver`, and reconstructs claims from the driver row and its tenant. Tenant status and driver active state are rechecked.

WebSocket dependency: no slug dependency exists. The delivery tracking namespace currently accepts client-supplied `driverId`/`tenantId` for location updates; R3 should authenticate the optional driver socket with its access token and derive both identifiers from verified claims. Public order tracking by opaque tracking token remains separate.

Notification dependency: push subscription uses `JwtAuthGuard` and derives tenant/recipient from driver JWT claims; it has no slug dependency.

Rate limiting: global `ThrottlerGuard` is active. Driver login currently uses the existing `auth` bucket at 10 requests per 60 seconds, keyed by the framework tracker (IP by default). No durable per-credential lockout exists. Slugless login should narrow this endpoint to 5 attempts per 60 seconds using the same infrastructure.

Enumeration risk: HTTP messages are already generic, but current logs include phone and slug and candidate lookup timing differs. R3 should remove credential values from logs, use one generic failure, perform candidate bcrypt comparisons in parallel and execute a dummy comparison when no candidate exists. Tenant names may appear only after a valid PIN proves access to multiple matching rows.

Migration required: NO.

API contract change: additive and backward-compatible. `tenantSlug` becomes optional; successful single-tenant responses remain unchanged; an authenticated multi-match result adds `requiresTenantSelection`, a short-lived selection token and allowed tenant choices; a new selection endpoint finalizes the tenant-bound session.

Recommended auth flow: architecture B — phone+PIN without slug; generic authentication over active candidates; one valid row creates the existing session directly; multiple valid rows return a post-auth selector; selection is restricted by the signed capability and then creates the same tenant-bound `AuthSession`. Legacy callers may continue sending an optional slug to select among already authenticated matches.

Compatibility risks: old clients must keep receiving the existing single-tenant response; selection tokens must never be accepted as access/refresh tokens; no arbitrary tenant ID may be trusted; access-token guards and driver WebSocket authentication must enforce session, driver and tenant binding without changing customer tracking sockets.

Implementation allowed: YES.
