"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slugify = slugify;
exports.toISOString = toISOString;
exports.isNullish = isNullish;
exports.buildPagination = buildPagination;
/**
 * Generates a slug from a string.
 * Converts to lowercase, replaces spaces/special chars with hyphens.
 */
function slugify(text) {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
}
/**
 * Formats a date to ISO string safely.
 */
function toISOString(date) {
    if (typeof date === 'string')
        return new Date(date).toISOString();
    return date.toISOString();
}
/**
 * Checks if a value is null or undefined.
 */
function isNullish(value) {
    return value === null || value === undefined;
}
/**
 * Creates a pagination object from count and params.
 */
function buildPagination(total, page, pageSize) {
    const totalPages = Math.ceil(total / pageSize);
    return {
        total,
        page,
        pageSize,
        totalPages,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
    };
}
//# sourceMappingURL=index.js.map