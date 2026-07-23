import { isCampaignDispatchEnabled } from './campaign-dispatch.config';

describe('campaign dispatch feature gate', () => {
  it('enables dispatch only when Redis, BullMQ and campaign dispatch are explicitly available', () => {
    expect(isCampaignDispatchEnabled({
      REDIS_ENABLED: 'true',
      BULLMQ_ENABLED: 'true',
      CAMPAIGNS_DISPATCH_ENABLED: 'true',
    })).toBe(true);
  });

  it.each([
    ['REDIS_ENABLED', 'false'],
    ['BULLMQ_ENABLED', 'false'],
    ['BULLMQ_ENABLED', undefined],
    ['CAMPAIGNS_DISPATCH_ENABLED', 'false'],
  ] as const)('keeps dispatch disabled when %s is %s', (key, value) => {
    const environment: NodeJS.ProcessEnv = {
      REDIS_ENABLED: 'true',
      BULLMQ_ENABLED: 'true',
      CAMPAIGNS_DISPATCH_ENABLED: 'true',
    };
    if (value === undefined) delete environment[key];
    else environment[key] = value;

    expect(isCampaignDispatchEnabled(environment)).toBe(false);
  });
});
