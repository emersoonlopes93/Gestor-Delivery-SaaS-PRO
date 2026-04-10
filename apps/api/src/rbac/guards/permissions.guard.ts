import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/decorators';
import { RbacService } from '../rbac.service';

/**
 * Guard that checks if the authenticated tenant user has the required permissions.
 * Use with @RequirePermissions('orders.read', 'orders.create')
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger('PermissionsGuard');

  constructor(
    private reflector: Reflector,
    private rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no permissions are required, allow access
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.sub) {
      throw new ForbiddenException('Authentication required');
    }

    const userPermissions = await this.rbacService.getUserPermissions(user.sub);

    const hasAll = requiredPermissions.every((p) =>
      userPermissions.includes(p),
    );

    if (!hasAll) {
      this.logger.warn(
        `Permission denied for user ${user.sub}. Required: ${requiredPermissions.join(', ')}`,
      );
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
