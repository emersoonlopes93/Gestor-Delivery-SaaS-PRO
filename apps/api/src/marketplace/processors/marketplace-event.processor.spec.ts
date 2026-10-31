import { IfoodApiError } from '../providers/ifood-api.error';
import { marketplaceBackoffStrategy } from './marketplace-event.processor';

describe('marketplaceBackoffStrategy', () => {
  it('uses Retry-After when it exceeds the exponential delay', () => {
    const error = new IfoodApiError('rate limited', true, 429, undefined, 30000);
    expect(marketplaceBackoffStrategy(1, 'ifood-retry-after', error)).toBe(30000);
  });

  it('keeps the exponential floor for transient failures', () => {
    expect(marketplaceBackoffStrategy(3, 'ifood-retry-after', new Error('timeout'))).toBe(20000);
  });
});
