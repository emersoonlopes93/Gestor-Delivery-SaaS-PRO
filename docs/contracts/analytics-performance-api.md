# Analytics Performance API

All `GET /analytics/performance/*` routes are authenticated tenant routes, require
`reports.read`, and derive the tenant exclusively from the canonical JWT context.
`tenantId` is not accepted as a query parameter.

Routes: `overview`, `funnel`, `products`, and `acquisition`. Common `from`/`to`
values are inclusive `YYYY-MM-DD` dates, default to the last 30 local days and
are capped at 90. The timezone is `TenantSettings.timezone` with
`America/Sao_Paulo` fallback. `compare=true` uses the immediately preceding,
equal-length non-overlapping period.

Behavioral metrics are read only from `AnalyticsDailyAggregate`; normal reads do
not query `AnalyticsEvent`. Realized revenue, completed orders, cancellations and
completed quantities read authoritative `Order`/`OrderItem`; browser `valueSum`
is never revenue. Conversion is submitted sessions/menu-view sessions, acceptance
is confirmed/submitted, completion is completed/submitted, and AOV is realized
revenue/completed orders. Zero denominators are `0`, never `NaN` or `Infinity`.

Products use deterministic sorting with `productId` tie-breaker, default
`limit=20` and maximum `100`. Missing catalog products fall back to
`Produto removido`.

## Partial acquisition

PR 2B returns only materialized `utm_source`, `utm_medium` and `utm_campaign`
rows. It explicitly returns `attributionStatus: partial`,
`coverage: utm_tagged_only`, `directUnknownAvailable: false`, and
`revenueAttributionAvailable: false`. Direct/unknown, referrer attribution,
first/last touch and channel revenue are deferred to PR 3A. Acquisition revenue
is therefore `null`, never invented as `0`.

Empty lists are `[]`; counters are `0`; `previous` and `delta` are `null` when
comparison is disabled. For deltas where previous is zero, percentage is zero
only when current is also zero; otherwise it is `null`.
