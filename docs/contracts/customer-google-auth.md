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

R10 intentionally preserves the customer session contract: a 30-day access JWT in the existing browser storage, without `AuthSession`, refresh token, or server-side logout. This is tracked as **CUSTOMER SESSION HARDENING FOLLOW-UP** before definitive Go-Live.

Guest checkout remains available. The Google linking flow only changes customer authentication; it does not clear the cart, fulfillment selection, coupon, checkout step, or address draft. Tenant changes continue to clear customer auth state.
