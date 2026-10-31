import { describe, expect, it } from 'vitest';
import { templateSegmentToBusinessSegment } from './business-segment';

describe('templateSegmentToBusinessSegment', () => {
  it('maps canonical onboarding template segments', () => {
    expect(templateSegmentToBusinessSegment('pizzaria')).toBe('PIZZARIA');
    expect(templateSegmentToBusinessSegment('hamburgueria')).toBe('HAMBURGUERIA');
    expect(templateSegmentToBusinessSegment('padaria')).toBe('PADARIA');
  });

  it('does not infer an unknown segment', () => {
    expect(templateSegmentToBusinessSegment('loja do joao')).toBeNull();
  });
});
