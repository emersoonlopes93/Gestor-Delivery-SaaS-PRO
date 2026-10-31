export class IfoodApiError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly httpStatus?: number,
    readonly providerCode?: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'IfoodApiError';
  }
}
