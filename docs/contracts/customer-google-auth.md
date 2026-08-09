---
title: Customer Google Authentication
status: current
owner: engineering
---

# Customer Google Authentication

Google Sign-In is optional for the public storefront and is tenant-scoped. The canonical customer identity remains the existing tenant-scoped phone/OTP customer.

## Identity and linking

- `CustomerExternalIdentity` stores only `tenantId`, `customerId`, provider `GOOGLE`, and Google `sub`.
- The same Google account may be linked in different tenants.
- Uniqueness is `(tenantId, provider, providerSubject)` and `(customerId, provider)`; there is no global provider/subject uniqueness.
- Email is not used for lookup or automatic linking. A first Google login returns a five-minute, audience-bound linking capability and requires the existing WhatsApp OTP flow to prove phone ownership.
- An existing Google identity authenticates the linked customer without requesting OTP again. A collision returns `GOOGLE_IDENTITY_ALREADY_LINKED`; the service never silently relinks it.

## Verification and configuration

The API uses `google-auth-library` to verify the Google ID token signature, audience, expiration, issuer, subject, email, and `email_verified`. It does not persist an ID token, Google access token, refresh token, or client secret.

Configure the same public OAuth client ID in `GOOGLE_CLIENT_ID` for the API and `VITE_GOOGLE_CLIENT_ID` for the storefront. The storefront hides the Google button when the public value is absent. Google Cloud project setup and real credentials are operational work and are not performed from this repository.

## Session and checkout boundary

OTP login, an already-linked Google identity, and Google first-link completion after OTP all issue credentials through the same `CustomerSessionService` and persisted `AuthSession` contract.

- Customer access JWTs contain only `sub` (customer ID), `tenantId`, `type=customer`, `sid`, `iat`, and `exp`. The canonical access TTL is 15 minutes.
- Refresh tokens use the existing project transport (response body plus the tenant-scoped storefront store), are stored only as SHA-256 hashes in `AuthSession`, rotate once, and are bound to the persisted customer and tenant.
- The canonical refresh/session absolute TTL is `JWT_REFRESH_EXPIRES_IN`, defaulting to 7 days. Customer rotation preserves the original absolute expiry; a new login starts a new horizon.
- Refresh consumption is atomic. The previous token becomes invalid immediately, and existing family reuse detection remains active.
- Customer logout revokes the current `AuthSession`. The existing JWT strategy checks `AuthSession` for every `sid`, so protected customer requests reject a revoked session immediately.
- Protected customer routes reject legacy customer JWTs without `sid`; they also validate the persisted subject and tenant binding.
- The existing global `AuthSession` revocation script includes customer sessions because it revokes every active subject type. It must not be run from application deploys.
- The storefront bootstraps the persisted session, performs one single-flight refresh for concurrent 401 responses, retries each request at most once, and clears local credentials after definitive failure.
- Changing tenant slug revokes the previous customer session before clearing it. Sessions from tenant A cannot refresh or authorize data in tenant B.

**DEPLOY IMPACT:** existing authenticated customers will need to sign in again because legacy customer JWTs do not contain `sid` or a refresh token.

Guest checkout remains available. The Google linking flow only changes customer authentication; it does not clear the cart, fulfillment selection, coupon, checkout step, or address draft. Tenant changes continue to clear customer auth state.

Customers currently have no blocked, deleted, or archived state in the Prisma model, so an additional customer-state login/refresh rule is not applicable.
