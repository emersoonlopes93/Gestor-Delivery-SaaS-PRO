import { SetMetadata } from '@nestjs/common';

export const REQUIRES_FEATURE_KEY = 'requiresFeature';
export const RequiresFeature = (feature: string) => SetMetadata(REQUIRES_FEATURE_KEY, feature);
