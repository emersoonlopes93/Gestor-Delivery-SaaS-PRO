export declare const APP_CONFIG: {
    readonly api: {
        readonly defaultPort: 3333;
        readonly prefix: "/api/v1";
    };
    readonly jwt: {
        readonly defaultExpiresIn: "15m";
        readonly defaultRefreshExpiresIn: "7d";
    };
    readonly pagination: {
        readonly defaultPage: 1;
        readonly defaultPageSize: 20;
        readonly maxPageSize: 100;
    };
    readonly tenant: {
        readonly maxNameLength: 100;
        readonly maxSlugLength: 60;
    };
};
export declare const HTTP_STATUS_MESSAGES: Record<number, string>;
//# sourceMappingURL=index.d.ts.map