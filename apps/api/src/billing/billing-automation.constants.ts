export const BILLING_AUTOMATION_QUEUE = 'billing-recurring';
export const BILLING_AUTOMATION_RUN_JOB = 'billing-recurring-run';

export const isBillingAutomationQueueEnabled = (environment: NodeJS.ProcessEnv = process.env): boolean =>
  environment.REDIS_ENABLED !== 'false' && environment.BULLMQ_ENABLED === 'true';

export const isBillingAutomationEnabled = (environment: NodeJS.ProcessEnv = process.env): boolean =>
  environment.BILLING_AUTOMATION_ENABLED === 'true'
  && environment.BILLING_AUTOMATION_KILL_SWITCH !== 'true'
  && environment.NODE_ENV !== 'production';

export function billingAutomationCadenceMs(environment: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(environment.BILLING_AUTOMATION_CADENCE_MS ?? 15 * 60_000);
  return Number.isInteger(parsed) && parsed >= 60_000 && parsed <= 24 * 60 * 60_000
    ? parsed
    : 15 * 60_000;
}

export function billingAutomationBatchLimit(environment: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number(environment.BILLING_AUTOMATION_BATCH_LIMIT ?? 50);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 200 ? parsed : 50;
}
