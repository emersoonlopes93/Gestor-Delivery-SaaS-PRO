import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SKIP_RESPONSE_ENVELOPE_KEY } from '../decorators';

export interface ResponseShape<T> {
  success: boolean;
  data: T;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, T | ResponseShape<T>>
{
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<T | ResponseShape<T>> {
    const skipResponseEnvelope = this.reflector.getAllAndOverride<boolean>(
      SKIP_RESPONSE_ENVELOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    return next.handle().pipe(
      map((data) => {
        if (skipResponseEnvelope) {
          return data;
        }
        // If the data already has a 'success' property, don't wrap
        if (data && typeof data === 'object' && 'success' in data) {
          return data;
        }
        return {
          success: true,
          data,
        };
      }),
    );
  }
}
