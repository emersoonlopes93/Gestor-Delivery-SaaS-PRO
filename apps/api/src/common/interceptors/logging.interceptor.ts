import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import type { TenantJwtPayload } from '@gestor/types';
import type { RequestWithRequestId } from '../middlewares/request-id.middleware';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<RequestWithRequestId & Request & { user?: TenantJwtPayload }>();
    const { method, url } = request;
    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse<Response>();
        const statusCode = response.statusCode;
        const elapsed = Date.now() - now;

        const tenantId = request.user?.type === 'tenant' ? request.user.tenantId : undefined;
        const userId = request.user?.type === 'tenant' ? request.user.sub : undefined;
        const requestId = request.requestId;

        this.logger.log({
          message: 'http_request',
          method,
          path: url,
          statusCode,
          latencyMs: elapsed,
          ...(requestId ? { requestId } : {}),
          ...(tenantId ? { tenantId } : {}),
          ...(userId ? { userId } : {}),
        });
      }),
    );
  }
}
