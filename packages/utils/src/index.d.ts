/**
 * Generates a slug from a string.
 * Converts to lowercase, replaces spaces/special chars with hyphens.
 */
export declare function slugify(text: string): string;
/**
 * Formats a date to ISO string safely.
 */
export declare function toISOString(date: Date | string): string;
/**
 * Checks if a value is null or undefined.
 */
export declare function isNullish(value: unknown): value is null | undefined;
/**
 * Creates a pagination object from count and params.
 */
export declare function buildPagination(total: number, page: number, pageSize: number): {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
};
//# sourceMappingURL=index.d.ts.map