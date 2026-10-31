export const isCampaignDispatchEnabled = (environment: NodeJS.ProcessEnv = process.env) =>
  environment.REDIS_ENABLED !== 'false' &&
  environment.BULLMQ_ENABLED === 'true' &&
  environment.CAMPAIGNS_DISPATCH_ENABLED === 'true';
