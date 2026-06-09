# Fase 11 - Auditoria de Reuso do App do Cliente

## Ja existe e foi reutilizado

- Catalogo: `src/pages/StorefrontPage.tsx` com `/public/storefront/:tenantSlug`.
- Carrinho: `src/store/use-cart-store.ts` e `src/components/CartDrawer.tsx`.
- Checkout: `src/pages/CheckoutPage.tsx`, `CashbackSelector` e `CouponInput`.
- Login cliente: `src/components/LoginModal.tsx`, `src/store/useCustomerStore.ts` e token no `api-client`.
- Perfil, carteira, fidelidade, cashback, cupons e badges: `src/pages/CustomerProfilePage.tsx` consumindo `/public/customer-profile`.
- Historico e recompra rapida: `src/pages/OrdersHistoryPage.tsx` com `Pedir novamente`.
- Tracking em tempo real: `src/pages/OrderTrackingPage.tsx`, `useOrderSocket` e `useDeliverySocket`.
- Push web: `src/hooks/usePushNotifications.ts`, `public/sw.js` e controllers existentes de notificacao.
- Inteligencia comercial: `CustomerProfileController` ja consome `CustomerIntelligenceService`.

## Gaps reais tratados nesta fase

- Manifest PWA instalavel e metatags mobile.
- Icones PWA/maskable e splash via metadados nativos.
- Cache offline basico, fallback de navegacao e atualizacao automatica do service worker.
- Prompt de instalacao reutilizavel no Storefront.
- Configuracao base do Capacitor para Android/iOS, push e plugins nativos.
- Home inteligente usando o payload existente de `CustomerProfile`, sem novo endpoint.
