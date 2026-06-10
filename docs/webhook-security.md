# Webhook Security

## HMAC Validation

Billing webhooks are protected by HMAC-SHA256 when a secret is configured.

Expected headers:

- `x-webhook-signature`: hex digest or `sha256=<hex>`
- `x-webhook-timestamp`: Unix timestamp in seconds
- `x-webhook-id`: provider event id when available

Signature payload:

```text
<x-webhook-timestamp>.<raw request body>
```

The API compares signatures with `timingSafeEqual` and never logs full payloads, secrets or full signatures.

## Environment

- `ASAAS_WEBHOOK_HMAC_SECRET`: HMAC secret for Asaas billing webhooks.
- `WEBHOOK_REPLAY_WINDOW_SECONDS`: accepted timestamp drift, default `300`.
- `ASAAS_WEBHOOK_ALLOW_LEGACY_TOKEN`: temporary compatibility for `asaas-access-token`.
- `WEBHOOK_ALLOW_LEGACY_TOKEN`: generic fallback flag.
- `ASAAS_WEBHOOK_TOKEN` and `ASAAS_BILLING_WEBHOOK_SECRET`: legacy token values.

In production, unsigned webhooks fail closed unless legacy compatibility is explicitly enabled.

## Anti-Replay And Idempotency

Each accepted webhook creates an `ExternalWebhookEvent` row keyed by `provider + eventId`.

- Duplicate processed events return success without reprocessing.
- Events without external ids fall back to a strong payload hash plus timestamp.
- Old timestamps outside the replay window are rejected.
- Processing state is persisted as `processing`, `processed`, `failed` or `duplicate`.

## Billing Rules

Asaas payment attempt webhooks pass through HMAC/idempotency before updating attempts. The payment attempt service still stores provider event ids in attempt metadata, so duplicate payment confirmation cannot mark the same invoice or subscription twice.

## Troubleshooting

- `401 Missing webhook signature`: provider did not send signature/timestamp.
- `401 Webhook timestamp outside replay window`: provider clock drift or replayed event.
- `401 Invalid webhook signature`: wrong secret or different raw body in signature generation.
- `Raw webhook body unavailable`: API bootstrap must keep the Express JSON `verify` hook enabled.
