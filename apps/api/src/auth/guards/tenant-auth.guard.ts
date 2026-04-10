import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../common/decorators';

/**
 * Guard for tenant-context routes.
 * Validates that the JWT is present and belongs to a tenant user (type === 'tenant').
 */
@Injectable()
export class TenantAuthGuard extends AuthGuard('jwt') implements CanActivate {
  constructor(private reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Run JWT validation
    const canActivate = await (super.canActivate(context) as Promise<boolean>);
    if (!canActivate) return false;

    // Verify the user is a tenant user
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || user.type !== 'tenant') {
      throw new UnauthorizedException('Tenant authentication required');
    }

    return true;
  }
}
