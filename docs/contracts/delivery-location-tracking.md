# Driver location tracking

## Canonical lifecycle

Operational tracking requires both `DriverShift ACTIVE` and `DeliveryRun IN_PROGRESS` or `RETURNING`. A shift without a run does not start continuous capture. Completing one stop does not stop capture; tracking stops only after the whole run leaves its operational states. GPS or network failure never changes the run state machine.

## Ingestion and persistence

Every sample derives `tenantId` and `driverId` from the authenticated session and references the active shift and run:

- `shiftId` and `runId` bind the point to the correct operational work;
- `recordedAt` preserves device time order;
- `eventKey` enables idempotent replay across WebSocket and HTTP;
- optional `accuracy`, `heading`, and `speed` preserve quality and movement data without inventing ETA;
- `source` distinguishes foreground and background without creating competing persistence paths.

The latest position stays on `DeliveryDriver` for fast reads. Raw callbacks are sampled at an approximate 10-second cadence. The app keeps a bounded FIFO buffer, sends batches of at most 100 points, and removes only acknowledged keys. The API validates coordinates, timestamps, and optional measures, deduplicates by tenant/driver/event key, and never accepts operational identity from the client.

## Retention and access

Detailed samples are retained for 30 days and deleted in tenant-scoped, idempotent batches. Runs, shifts, orders, lifecycle timestamps, and other operational summaries remain.

`GET /delivery/runs/:id/locations` requires a tenant JWT and `delivery.read` or `delivery.dispatch`. A public order token cannot access this API or receive history, other stops, or a tenant-global route.

The tenant event `driverLocationUpdated` contains tenant, driver, run, current coordinate, and timestamp. The public `locationUpdate` event remains restricted to the authorized opaque order room. Consumers must apply `getLocationFreshness` and must never present a stale coordinate as live.
