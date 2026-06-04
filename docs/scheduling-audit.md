# Scheduling Audit

Generated: 2026-06-04

## Summary

The repository contains a partially implemented scheduling module. Key existing artifacts:

- Prisma models: `TimeSlot`, `ScheduledOrder` (in `apps/api/prisma/schema.prisma`).
- `SchedulingService` with basic slot creation and scheduled order management (`apps/api/src/scheduling/scheduling.service.ts`).
- `SchedulingController` exposing endpoints to create/list slots and scheduled orders (`/api/v1/scheduling`).
- Public storefront endpoint to fetch slots: `GET /public/storefront/:slug/slots`.
- AI tool `consultar_slots_agendamento` in `AgentToolsService` that already uses `SchedulingService.getAvailableTimeSlots`.
- DTOs include `scheduledFor`/`timeSlotId` for order creation (`packages/types/src/order.ts`).

## Gaps Identified

- No tenant-scoped configuration for scheduling (no `SchedulingSettings`).
- No weekly availability windows model (`SchedulingWindow`).
- No timezone-aware slot generation engine tied to tenant settings.
- `Order` model lacked `scheduledFor` and `isScheduled` fields (now added).
- No tenant UI or admin endpoints for scheduling settings and weekly windows.
- Frontend integration to call `/public/storefront/:slug/slots` appears missing in source (only bundles contain minified references).
- Generator service not previously implemented; tool relies on DB slots being present.

## Files Inspected

- `apps/api/src/scheduling/scheduling.service.ts`
- `apps/api/src/scheduling/scheduling.controller.ts`
- `apps/api/prisma/schema.prisma` (models `TimeSlot`, `ScheduledOrder`, `Order`)
- `apps/api/src/ai-agent/services/agent-tools.service.ts` (tool `consultar_slots_agendamento`)
- `apps/api/src/storefront/storefront.controller.ts`
- `packages/types/src/order.ts`

## Actions Taken (so far)

- Added `SchedulingSettings` and `SchedulingWindow` Prisma models.
- Added `scheduledFor` and `isScheduled` fields to `Order` model in Prisma schema.
- Created `SchedulingGeneratorService` to generate slots from tenant settings/windows.
- Registered generator service and added admin endpoint `POST /api/v1/scheduling/time-slots/auto-generate`.
- Enhanced `SchedulingService.getAvailableTimeSlots` to apply scheduling settings constraints (minimum advance, maximum days, capacity filtering).
- Updated types (`packages/types/src/order.ts`) to include scheduling fields in DTOs.

## Next Recommended Steps

1. Implement API endpoints to manage `SchedulingSettings` and `SchedulingWindow` (CRUD) for tenant admin.
2. Add DB seed to create default `SchedulingSettings` per tenant.
3. Improve timezone-accurate slot time calculation in `SchedulingGeneratorService` (ensure correct UTC timestamps from tenant local times). Consider using `luxon` or `date-fns-tz` if needed.
4. Integrate generator into a scheduled job or run-once admin action to pre-populate upcoming slots.
5. Update `consultar_slots_agendamento` and storefront checkout to rely exclusively on `getAvailableTimeSlots` (already wired but ensure generator runs).
6. Implement frontend tenant UI to edit settings and weekly windows; storefront checkout UI to select slots.
7. Add E2E tests and run `pnpm check:no-any` and builds.

