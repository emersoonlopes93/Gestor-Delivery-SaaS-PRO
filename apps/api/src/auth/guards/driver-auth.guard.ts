import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { DriverAuthService } from '../driver-auth.service';

@Injectable()
export class DriverAuthGuard implements CanActivate {
  constructor(
    private readonly driverAuthService: DriverAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Authentication token not found');
    }

    try {
      const payload = await this.driverAuthService.validateAccessToken(token);

      // Assigning payload to request.user so controllers can access it
      const req = request as Request & { user: { sub: string; id: string; tenantId: string; type: string }; tenantId: string };
      req.user = {
        ...payload,
        id: payload.sub, // Injetar 'id' para os controllers que esperam user.id
      };
      req.tenantId = payload.tenantId;

      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
