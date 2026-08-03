# R6 - auditoria de safe area, viewport mobile e tema

Data: 2026-08-03  
Base: `main-copy` / `012795d37aeacdff1f345b24a49aa30f23baadf5`

## AUDIT R6

- Apps audited: `web-tenant`, `web-delivery`, `web-storefront`; `web-admin` foi
  inspecionado e classificado como web-only, sem superfície no APK R6.
- Shared layout primitives: `AppLayout`, `AuthLayout`, `Modal`, `BottomSheet`,
  `StorefrontShell` e os controles fixos do checkout/PWA.
- Theme source of truth: store Zustand e tokens semânticos de cada aplicação;
  no storefront, `StorefrontShell` e os tipos de `@gestor/theme` continuam
  canônicos para o tema do tenant.
- Global CSS entry: `apps/web-tenant/src/index.css`,
  `apps/web-delivery/src/index.css` e `apps/web-storefront/src/index.css`.
- Safe-area source: variáveis CSS baseadas em `env(safe-area-inset-*)`, sem
  valores duplicados em componentes.
- Viewport-fit: já presente no tenant; adicionado ao delivery e storefront.
- Capacitor edge-to-edge: o tenant já identifica runtime Capacitor e aplica
  `is-capacitor`; não existe configuração explícita de edge-to-edge no wrapper.
- Native status bar: sem plugin/configuração no projeto atual.
- Native navigation bar: sem plugin/configuração no projeto atual.
- Sidebar root cause: a sidebar mobile é `position: fixed`; por isso o inset
  horizontal do `app-shell` não alcançava o drawer em landscape. Top e bottom
  já pertenciam corretamente ao root flex da sidebar, com `nav` scrollável.
- Top inset issues: auth/loading mobile não usavam o primitive estrutural; o
  header e a sidebar do tenant já tinham proteção introduzida antes da R6.
- Bottom inset issues: `BottomSheet`, painel móvel do mapa, CTA fixo do checkout
  e banner PWA terminavam em `bottom: 0` sem proteção própria.
- 100vh issues: login/active delivery e telas full-height selecionadas do tenant
  usavam viewport estático apesar de scroll/teclado mobile.
- Portal theme issues: modal e `react-select` já herdavam os atributos no
  `documentElement`; `InfoTooltip`, renderizado em `document.body`, usava uma
  superfície gray fixa.
- Hardcoded color hotspots: superfícies estruturais do delivery, tooltip e CTA
  do checkout eram legados. Cores laranja/verde/vermelho de marca e status foram
  preservadas como exceções intencionais.
- Token gaps: faltava foreground explícito para toast de sucesso e o delivery
  não possuía tokens estruturais light/dark.
- PR #33 protections reused: `viewport-fit=cover` do tenant, classe
  `is-capacitor`, safe-area vars/utilities, `100dvh` do shell, modal safe e
  offsets seguros do toaster.
- Duplication risks: regras automáticas por nome de componente e classes safe
  simultâneas tornavam a propriedade repetida e ocultavam o nível estrutural.
  A R6 mantém um único primitive explícito em cada root afetado.
- Migration required: não.
- API contract change: não.
- New dependency required: não.
- Recommended minimal architecture: preservar os design systems atuais, usar
  os primitives safe-area nos roots fixed/sticky, `100dvh` somente em layouts
  mobile full-height e tokens semânticos somente nos hotspots comprovados.
- Implementation allowed: YES.

## Matriz de superfícies

| Superfície | Antes | Depois R6 |
| --- | --- | --- |
| Sidebar/drawer tenant | inset lateral no pai, fora do fixed | correto no root mobile |
| Header tenant | correto, proteção herdada da PR #33 | correto e explícito |
| Main tenant | bottom protegido, regra repetida | correto e explícito |
| Bottom sheet/map controls | sem safe-bottom | correto |
| Modal/dialog | correto com safe-modal e `100dvh` | preservado |
| Toast | correto, mas configuração duplicada | uma fonte CSS |
| Tooltip portal | hardcoded dark | tokens de popover light/dark |
| Checkout fixed CTA | sem safe-bottom, superfície light fixa | safe action e tokens storefront |
| PWA install/banner | bottom hardcoded | offset/sheet com safe-bottom |
| Delivery login/active | `h-screen`, superfícies light fixas | `100dvh`, safe inset e tokens system |
| Native bars | não integrado | não alterado; plugin novo fora de escopo |

Não houve alteração de `applicationId`, branding Android, API, Prisma, migration,
seed, dependência, feature flag, produção ou deploy.
