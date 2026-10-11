import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class RbacService {
  private readonly logger = new Logger('RbacService');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all permissions for a tenant user.
   */
  async getUserPermissions(userId: string): Promise<string[]> {
    const userRoles = await this.prisma.tenantClient.tenantUserRole.findMany({
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
      if (ur.role) {
        for (const rp of ur.role.rolePermissions) {
          permissions.add(rp.permission.slug);
        }
      }
    }

    return Array.from(permissions);
  }

  /**
   * Get all roles for a tenant user.
   */
  async getUserRoles(userId: string): Promise<string[]> {
    const userRoles = await this.prisma.tenantClient.tenantUserRole.findMany({
      where: { userId },
      include: { role: true },
    });

    return userRoles
      .map((ur) => ur.role?.slug)
      .filter((slug): slug is string => typeof slug === 'string');
  }

  /**
   * Check if a tenant user has a specific permission.
   */
  async hasPermission(userId: string, permission: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);
    return permissions.includes(permission);
  }

  /**
   * Mirrors the elevated-role behavior of PermissionsGuard for code paths that
   * must project a response differently instead of rejecting the whole route.
   */
  async hasPermissionOrElevatedRole(userId: string, permission: string): Promise<boolean> {
    const [permissions, roles] = await Promise.all([
      this.getUserPermissions(userId),
      this.getUserRoles(userId),
    ]);

    return roles.includes('tenant_owner')
      || roles.includes('tenant_admin')
      || permissions.includes(permission);
  }

  /**
   * Get all roles for a tenant with their permissions.
   */
  async getTenantRoles(tenantId: string) {
    // Note: tenantId is passed via where, but the extended client will also ensure
    // isolation if the request context matches.
    return this.prisma.tenantClient.tenantRole.findMany({
      where: { tenantId },
      include: {
        rolePermissions: {
          include: { permission: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Get all tenant permissions (global seed list).
   */
  async getAllPermissions() {
    // TenantPermission is NOT isolated in PrismaService as it's a global entity
    return this.prisma.tenantPermission.findMany({
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
  }
}
