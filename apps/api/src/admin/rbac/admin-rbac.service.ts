import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AdminRbacService {
  private readonly logger = new Logger('AdminRbacService');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all permissions for an admin user.
   */
  async getUserPermissions(userId: string): Promise<string[]> {
    const userRoles = await this.prisma.adminUserRole.findMany({
      where: { userId },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    const permissions = new Set<string>();
    for (const ur of userRoles) {
      for (const rp of ur.role.rolePermissions) {
        permissions.add(rp.permission.slug);
      }
    }

    return Array.from(permissions);
  }

  /**
   * Check if an admin user has a specific permission.
   */
  async hasPermission(userId: string, permission: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    return permissions.includes(permission);
  }

  /**
   * Get all admin roles.
   */
  async getAllRoles() {
    return this.prisma.adminRole.findMany({
      include: {
        rolePermissions: {
          include: { permission: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }
}
