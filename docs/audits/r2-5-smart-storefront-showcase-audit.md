# AUDIT R2.5 — Smart storefront showcase

Date: 2026-08-01

Existing storefront contract: `StorefrontPayload` from `@gestor/types`, served by `GET /public/storefront/:slug`; it already contains tenant-scoped, active and currently available categories, products and combos plus normalized theme/layout customization.

Existing config store: `TenantSettings.storefrontLayoutJson`, read and written through the existing authenticated `GET/PATCH /tenant/storefront-customization` contract. It is suitable for an additive, versioned showcase setting without a database change.

Existing carousel: no general-purpose carousel library is adopted. Existing horizontal UI uses native overflow. The showcase should use CSS `overflow-x` and scroll snap, without autoplay or a new dependency.

Existing category navigation: shared `CategoryNavigation` in `@gestor/storefront-ui`; the public storefront already feeds it canonical categories and supports horizontal scrolling plus section focus/scroll. No second category source or component is required.

Existing featured concept: `Product.isFeatured` is mapped by the storefront service to the canonical `featured` badge and virtual section.

Existing promotion concept: there is a real promotion presentation contract based on `compareAtPrice > basePrice`, mapped to the canonical `promotion` badge. It can safely back a `PROMOTIONS` strategy for products already admitted to the storefront payload.

Existing combo concept: combos are real catalog products with bundle/slot data and a distinct `StorefrontComboPayload`. Mixing that distinct interaction contract into a product-only showcase would duplicate rendering and selection rules, so `COMBOS` is not enabled in R2.5.

Automatic ranking source: `BusinessIntelligenceService.getStorefrontBestSellers` uses a 30-day window, tenant-scoped completed orders, and sums `OrderItem.quantity`, with a 15-minute in-process cache. This supports the semantic strategy `BEST_SELLING`; it does not prove distinct-order count and therefore does not support `MOST_ORDERED`.

Availability source: `StorefrontService` filters active, non-deleted tenant categories/products through the canonical `AvailabilityService.decideMany` for the requested fulfillment channel. Showcase selection must run only over that already-filtered product set.

Preview/public sharing: public rendering uses shared `ProductRenderer` and `CategoryNavigation`; the tenant preview has an existing compact renderer but consumes the same normalized layout configuration and catalog endpoints. R2.5 can show the same resolved selection in that preview without creating a third renderer. Full renderer convergence remains R5 scope.

Cache implications: public payloads use `storefront:<slug>:<fulfillmentType>` with the existing TTL. `PATCH /tenant/storefront-customization` already invalidates delivery and pickup keys. The existing best-selling ranking cache remains unchanged. No new cache or invalidation strategy is required.

Migration required: NO.

New dependency required: NO.

API contract change required: YES, additive only — extend the existing normalized layout JSON and public payload with an optional resolved showcase. No new endpoint or structural replacement is required.

Duplication risk: low if selection is resolved once in the API from canonical eligible products, the public page reuses `ProductRenderer`, categories keep using `CategoryNavigation`, and the preview keeps its existing renderer. High-risk alternatives rejected: querying per card, duplicating availability logic, inventing a second analytics aggregation, or treating combos as ordinary products.

Recommended minimal architecture: add a normalized `showcase` object to `StorefrontLayoutSettings`; validate configured product IDs against the authenticated tenant on save; resolve MANUAL, AUTOMATIC (`BEST_SELLING` and `PROMOTIONS`) and HYBRID selections in `StorefrontService` from the already eligible product map; expose at most 12 resolved products in the existing payload; render a CSS scroll-snap strip above category navigation with `ProductRenderer`; configure it in the existing storefront customization page.

Implementation allowed: YES.
