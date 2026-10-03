import { IfoodApiError } from './ifood-api.error';

export class Food99ApiError extends IfoodApiError {
  constructor(
    message: string,
    retryable: boolean,
    httpStatus?: number,
    providerCode?: string,
    retryAfterMs?: number,
  ) {
    super(message, retryable, httpStatus, providerCode, retryAfterMs);
    this.name = 'Food99ApiError';
  }
}
