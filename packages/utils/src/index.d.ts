export declare function slugify(text: string): string;
export declare function toISOString(date: Date | string): string;
export declare function isNullish(value: unknown): value is null | undefined;
export declare function buildPagination(total: number, page: number, pageSize: number): {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
};
