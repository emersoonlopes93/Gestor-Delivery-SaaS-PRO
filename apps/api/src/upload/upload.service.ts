import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class UploadService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveTenantIdFromRequestUser(user: unknown): Promise<string> {
    const tenantId = (user as { tenantId?: unknown } | null)?.tenantId;
    if (typeof tenantId === 'string' && tenantId.length > 0) {
      return tenantId;
    }

    // Fallback: some contexts may provide tenantId in other shapes; keep strict.
    throw new Error('TenantId não encontrado no usuário autenticado');
  }
}
