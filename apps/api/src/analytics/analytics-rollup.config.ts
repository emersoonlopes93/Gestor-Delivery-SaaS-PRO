export const DEFAULT_ANALYTICS_ROLLUP_RECENT_DAYS = 3;
export const DEFAULT_ANALYTICS_ROLLUP_INTERVAL_MS = 6 * 60 * 60 * 1_000;

export function isAnalyticsRollupQueueEnabled(): boolean {
  return process.env.REDIS_ENABLED !== 'false'
    && process.env.BULLMQ_ENABLED === 'true'
    && process.env.ANALYTICS_ROLLUP_ENABLED === 'true';
}

export function isAnalyticsRollupSchedulerEnabled(): boolean {
  return isAnalyticsRollupQueueEnabled()
    && process.env.ANALYTICS_ROLLUP_SCHEDULER_ENABLED === 'true'
    && process.env.NODE_ENV !== 'test';
}

export function analyticsRollupRecentDays(): number {
  return boundedInteger(
    process.env.ANALYTICS_ROLLUP_RECENT_DAYS,
    DEFAULT_ANALYTICS_ROLLUP_RECENT_DAYS,
    1,
    31,
  );
}

export function analyticsRollupIntervalMs(): number {
  return boundedInteger(
    process.env.ANALYTICS_ROLLUP_INTERVAL_MS,
    DEFAULT_ANALYTICS_ROLLUP_INTERVAL_MS,
    60_000,
    24 * 60 * 60 * 1_000,
  );
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}
