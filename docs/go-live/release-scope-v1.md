# Escopo Go-Live 1.0

## Preset recomendado

Habilitar somente features estáveis já entregues: autenticação, tenant, RBAC,
catálogo, storefront, checkout, pedidos, upload, health, configurações, POS e
financeiro. Manter beta e coming-soon desabilitadas até validação específica.

## Dependências de bloqueio

- E0-OPS: redeploy controlado, revogação global de AuthSession e smokes.
- E0H: purga Git coordenada, sem reescrita nesta R0.
- Evidência autenticada para os fluxos R1-R10 ainda pendentes.
