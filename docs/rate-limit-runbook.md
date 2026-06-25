# Rate Limit Runbook

## Politica

Rate limit deve reduzir abuso sem bloquear operacao normal. Auth e token refresh sao mais restritivos; checkout e webhook permitem burst controlado.

## Limites Atuais

Global em `apps/api/src/app.module.ts`:

- `default`: `RATE_LIMIT_MAX_REQUESTS` por `RATE_LIMIT_TTL_SECONDS`.
- `auth`: `RATE_LIMIT_AUTH_MAX_REQUESTS` por `RATE_LIMIT_AUTH_TTL_SECONDS`.
- `public`: `RATE_LIMIT_PUBLIC_MAX_REQUESTS` por `RATE_LIMIT_PUBLIC_TTL_SECONDS`.

Decorators especificos:

- Admin login: 5/min.
- Admin refresh: 10/min.
- Tenant login: 10/min.
- Tenant refresh: 10/min.
- Tenant register: 5/5min.
- Driver login/refresh: 10/min.
- Customer OTP send: 5/min.
- Customer OTP validate: 10/min.
- Public checkout/validate: 60/min.
- Storefront/menu/slots: 120/min.
- Webhooks billing/Asaas/security smoke: burst controlado 60-120/min.
- Upload tenant/admin: 20-30/min.

## Chave De Limite

O guard padrao considera IP. Quando possivel, logs devem incluir `requestId`, rota e tenant/storefront sem expor token ou payload sensivel.

## Validacao Tecnica

- Testar auth com repeticao acima do limite e esperar 429.
- Testar checkout com volume normal e confirmar que nao bloqueia pedido legitimo.
- Testar webhook com burst controlado e confirmar HMAC/idempotencia.
- Testar upload com arquivos validos e invalidos.

## Ajuste Operacional

- Se houver falso positivo em cliente real, aumentar limite de rota especifica antes do global.
- Se houver ataque, reduzir `public` temporariamente e bloquear IP no provedor/CDN.
- Nunca desligar rate limit global em producao.
