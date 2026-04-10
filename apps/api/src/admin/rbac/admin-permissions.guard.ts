import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ADMIN_PERMISSIONS_KEY } from '../../common/decorators';
import { AdminRbacService } from './admin-rbac.service';

/**
 * Guard that checks if the authenticated admin user has the required admin permissions.
 * Use with @RequireAdminPermissions('saas.tenants.read')
 */
@Injectable()
export class AdminPermissionsGuard implements CanActivate {
  private readonly logger = new Logger('AdminPermissionsGuard');

  constructor(
    private reflector: Reflector,
    private adminRbacService: AdminRbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      ADMIN_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.sub || user.type !== 'admin') {
      throw new ForbiddenException('Admin authentication required');
    }

    const userPermissions = await this.adminRbacService.getUserPermissions(
      user.sub,
    );

    const hasAll = requiredPermissions.every((p) =>
      userPermissions.includes(p),
    );

    if (!hasAll) {
      this.logger.warn(
        `Admin permission denied for user ${user.sub}. Required: ${requiredPermissions.join(', ')}`,
      );
      throw new ForbiddenException('Insufficient admin permissions');
    }

    return true;
  }
}
