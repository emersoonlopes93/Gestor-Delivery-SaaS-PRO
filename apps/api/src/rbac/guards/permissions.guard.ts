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
 * Usage: @RequirePermissions('orders.read', 'orders.create')
 * Semantics: OR — the user must have at least ONE of the listed permissions.
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

    const [userPermissions, userRoles] = await Promise.all([
      this.rbacService.getUserPermissions(user.sub),
      this.rbacService.getUserRoles(user.sub),
    ]);

    // Implicitly allow owners and admins to access everything
    if (userRoles.includes('tenant_owner') || userRoles.includes('tenant_admin')) {
      return true;
    }

    // OR lógico: basta ter qualquer uma das permissões listadas
    const hasAny = requiredPermissions.some((p) =>
      userPermissions.includes(p),
    );

    if (!hasAny) {
      this.logger.warn(
        `Permission denied for user ${user.sub}. Required any of: [${requiredPermissions.join(', ')}]`,
      );
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
