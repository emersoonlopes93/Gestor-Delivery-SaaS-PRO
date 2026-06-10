# Session Security

## Current Design

Admin, tenant and driver logins now create a persisted `AuthSession`. Customer OTP auth still issues only an access token and does not use refresh tokens.

Refresh tokens are JWTs signed with `JWT_REFRESH_SECRET`, but only their SHA-256 hash is stored in `auth_sessions`. Access tokens include `sid` so the current session can be revoked on logout.

## Rotation Policy

- Login creates an `active` session with a new `refreshTokenFamilyId`.
- Refresh requires an `active` session, matching token hash and non-expired session.
- Successful refresh marks the old session as `rotated` and creates a replacement session in the same family.
- Reusing a rotated refresh token marks the whole family as `compromised`.
- Revoked, expired or compromised sessions cannot mint new access tokens.

## Revocation

- `POST /auth/admin/logout`, `POST /auth/tenant/logout` and `POST /auth/driver/logout` revoke the current `sid`.
- `POST /auth/admin/logout-global`, `POST /auth/tenant/logout-global` and `POST /auth/driver/logout-global` revoke all active sessions for the subject.
- `GET /auth/*/sessions` lists active sessions for the current subject.

## Expiration

- Access token TTL is controlled by `JWT_EXPIRES_IN` and defaults to `15m`.
- Refresh token/session TTL is controlled by `JWT_REFRESH_EXPIRES_IN` and defaults to `7d`.

## Operational Rules

- Admin refresh checks that the admin user still exists and is active.
- Tenant refresh checks that the tenant user is active and the tenant is `active` or `trial`.
- Driver refresh checks that the driver is active and the tenant is `active` or `trial`.
- Impersonation remains access-token-only with a 15 minute token and no refresh session.

## Frontend Behavior

The admin, tenant and delivery clients store the rotated refresh token returned by refresh. Tenant/admin clients coalesce simultaneous refresh attempts; delivery does the same through a shared refresh promise. Logout calls the server endpoint and then clears local tokens.

## Staging Smoke

Run the HTTP smoke before release:

```bash
pnpm --filter @gestor/api smoke:session-security-http-flow
```

Required envs:

- `SMOKE_API_BASE_URL`
- `SMOKE_ADMIN_EMAIL`
- `SMOKE_ADMIN_PASSWORD`
- `SMOKE_TENANT_OWNER_EMAIL`
- `SMOKE_TENANT_OWNER_PASSWORD`
- `SMOKE_TENANT_PREFIX=session-security-smoke`
- `SMOKE_CLEANUP=true`
- `DATABASE_URL`

GO requires `SESSION_SECURITY_HTTP_SMOKE_GO`. NO-GO prints `SESSION_SECURITY_HTTP_SMOKE_NO_GO`.

The smoke validates admin login, session listing, refresh rotation, old refresh reuse failure, compromised family state, current-session logout, `sid` invalidation, global logout, tenant register/refresh/logout and impersonation without refresh token.

To investigate a compromised session family, query `auth_sessions` by `refresh_token_family_id` and inspect `status`, `revoked_reason`, `previous_session_id` and `replaced_by_session_id`. Smoke sessions use a `User-Agent` prefixed with `gestor-session-security-smoke/`, so residual smoke sessions can be safely identified and removed after checking their tenant/run id.
