"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CategoryTemplateConfigSchema = exports.PizzaTemplateConfigSchema = void 0;
const zod_1 = require("zod");
exports.PizzaTemplateConfigSchema = zod_1.z.object({
    pricingStrategy: zod_1.z.enum(['highest', 'lowest', 'average', 'sum_halves']).default('highest'),
});
exports.CategoryTemplateConfigSchema = zod_1.z.record(zod_1.z.any()).optional();
//# sourceMappingURL=catalog.js.map