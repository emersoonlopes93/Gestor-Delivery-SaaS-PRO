import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

@Injectable()
export class TenantContextService {
  private static readonly storage = new AsyncLocalStorage<{ tenantId: string }>();

  /**
   * Run a function within a tenant context.
   */
  run(tenantId: string, callback: () => void) {
    return TenantContextService.storage.run({ tenantId }, callback);
  }

  /**
   * Get the current tenant ID from the context.
   */
  getTenantId(): string | undefined {
    return TenantContextService.storage.getStore()?.tenantId;
  }
}
