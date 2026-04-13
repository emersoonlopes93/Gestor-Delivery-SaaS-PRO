import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContextService } from '../context/tenant-context.service';
import type { Request as ExpressRequest } from 'express';
import type { TenantJwtPayload } from '@gestor/types';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly tenantContext: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler<unknown>): Observable<unknown> {
    const request = context.switchToHttp().getRequest<ExpressRequest & { user?: TenantJwtPayload }>();
    const user = request.user;

    // Only set context if it's a tenant user
    if (user && user.type === 'tenant' && user.tenantId) {
      return new Observable((subscriber) => {
        this.tenantContext.run(user.tenantId, () => {
          next.handle().subscribe(subscriber);
        });
      });
    }

    return next.handle();
  }
}
