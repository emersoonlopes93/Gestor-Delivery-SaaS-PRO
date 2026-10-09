import type { BusinessSegment } from '@gestor/types';

const TEMPLATE_SEGMENTS: Record<string, BusinessSegment> = {
  pizzaria: 'PIZZARIA',
  hamburgueria: 'HAMBURGUERIA',
  restaurante: 'RESTAURANTE',
  mercado: 'MERCADO',
  acai: 'ACAI',
  padaria: 'PADARIA',
};

export function templateSegmentToBusinessSegment(segment: string): BusinessSegment | null {
  return TEMPLATE_SEGMENTS[segment.trim().toLowerCase()] ?? null;
}
