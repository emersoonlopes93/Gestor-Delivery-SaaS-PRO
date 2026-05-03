import { z } from 'zod';
// ============================================
// ZOD SCHEMAS FOR TEMPLATE CONFIGS
// ============================================
export const PizzaTemplateConfigSchema = z.object({
    pricingStrategy: z.enum(['highest', 'lowest', 'average', 'sum_halves']).default('highest'),
});
export const CategoryTemplateConfigSchema = z.record(z.any()).optional();
//# sourceMappingURL=catalog.js.map