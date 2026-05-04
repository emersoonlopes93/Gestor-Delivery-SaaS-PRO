"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slugify = slugify;
exports.toISOString = toISOString;
exports.isNullish = isNullish;
exports.buildPagination = buildPagination;
function slugify(text) {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');
}
function toISOString(date) {
    if (typeof date === 'string')
        return new Date(date).toISOString();
    return date.toISOString();
}
function isNullish(value) {
    return value === null || value === undefined;
}
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