import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import type { TenantJwtPayload } from '@gestor/types';
import type { RequestWithRequestId } from '../middlewares/request-id.middleware';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithRequestId & Request & { user?: TenantJwtPayload }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';
    let details: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const errorResponse = exception.getResponse();

      if (typeof errorResponse === 'string') {
        message = errorResponse;
      } else if (typeof errorResponse === 'object') {
        const errObj = errorResponse as Record<string, unknown>;
        message = (errObj.message as string) || message;
        code = (errObj.error as string) || code;
        if (Array.isArray(errObj.message)) {
          details = { validationErrors: errObj.message };
          message = 'Validation failed';
          code = 'VALIDATION_ERROR';
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;

      const tenantId = request.user?.type === 'tenant' ? request.user.tenantId : undefined;
      const userId = request.user?.type === 'tenant' ? request.user.sub : undefined;
      const requestId = request.requestId;

      this.logger.error(
        {
          message: 'unhandled_error',
          errorMessage: exception.message,
          stack: exception.stack,
          method: request.method,
          path: request.url,
          ...(requestId ? { requestId } : {}),
          ...(tenantId ? { tenantId } : {}),
          ...(userId ? { userId } : {}),
        },
        undefined,
        'HttpExceptionFilter',
      );
    }

    const tenantId = request.user?.type === 'tenant' ? request.user.tenantId : undefined;
    const userId = request.user?.type === 'tenant' ? request.user.sub : undefined;
    const requestId = request.requestId;

    const errorBody = {
      success: false,
      error: {
        code,
        message,
        ...(details && { details }),
      },
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      ...(requestId ? { requestId } : {}),
    };

    if (status >= 500) {
      this.logger.error({
        message: 'http_exception',
        statusCode: status,
        code,
        errorMessage: message,
        method: request.method,
        path: request.url,
        ...(requestId ? { requestId } : {}),
        ...(tenantId ? { tenantId } : {}),
        ...(userId ? { userId } : {}),
      });
    } else {
      this.logger.warn({
        message: 'http_exception',
        statusCode: status,
        code,
        errorMessage: message,
        method: request.method,
        path: request.url,
        ...(requestId ? { requestId } : {}),
        ...(tenantId ? { tenantId } : {}),
        ...(userId ? { userId } : {}),
      });
    }

    response.status(status).json(errorBody);
  }
}
