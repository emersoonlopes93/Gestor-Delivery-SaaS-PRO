import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AdminTenantsService {
  private readonly logger = new Logger('AdminTenantsService');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all tenants (admin view).
   */
  async findAll(page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;

    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        skip,
        take: pageSize,
        include: { settings: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tenant.count(),
    ]);

    return {
      items: tenants,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      hasNext: page * pageSize < total,
      hasPrevious: page > 1,
    };
  }

  /**
   * Find a tenant by ID (admin view).
   */
  async findById(id: string) {
    return this.prisma.tenant.findUnique({
      where: { id },
      include: {
        settings: true,
        _count: {
          select: { users: true, roles: true },
        },
      },
    });
  }
}
