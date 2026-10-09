import type { BusinessSegment } from '@gestor/types';

export function normalizeBusinessSegmentForStorefront(
  businessSegment: BusinessSegment | null | undefined,
): BusinessSegment {
  return businessSegment ?? 'OTHER';
}
