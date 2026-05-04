export interface ApiResponse<T = unknown> {
    success: true;
    data: T;
    message?: string;
}
export interface ApiErrorResponse {
    success: false;
    error: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
    };
    statusCode: number;
    timestamp: string;
    path: string;
}
export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
}
export interface PaginationParams {
    page?: number;
    pageSize?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}
export interface HealthCheckResponse {
    status: 'ok' | 'degraded' | 'error';
    version: string;
    timestamp: string;
    uptime: number;
    services: {
        database: 'ok' | 'error';
    };
}
