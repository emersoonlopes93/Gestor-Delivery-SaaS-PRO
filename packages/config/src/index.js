// ============================================================
// Shared Configuration Constants
// ============================================================
export const APP_CONFIG = {
    api: {
        defaultPort: 3333,
        prefix: '/api/v1',
    },
    jwt: {
        defaultExpiresIn: '15m',
        defaultRefreshExpiresIn: '7d',
    },
    pagination: {
        defaultPage: 1,
        defaultPageSize: 20,
        maxPageSize: 100,
    },
    tenant: {
        maxNameLength: 100,
        maxSlugLength: 60,
    },
};
export const HTTP_STATUS_MESSAGES = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    500: 'Internal Server Error',
};
//# sourceMappingURL=index.js.map