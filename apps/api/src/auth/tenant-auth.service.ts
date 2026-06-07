import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { TenantStatus, TenantDefaultRole } from '@gestor/core';
import type { TenantJwtPayload } from '@gestor/types';

// Slug generator
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

@Injectable()
export class TenantAuthService {
  private readonly logger = new Logger('TenantAuthService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Authenticate a tenant user by email + password.
   * Resolves the tenant from the user record.
   */
  async login(email: string, password: string, tenantSlug?: string) {
    const normalizedEmail = email.toLowerCase();
    this.logger.debug(`Login attempt for email: ${normalizedEmail} (tenantSlug: ${tenantSlug})`);

    // Find user — if tenantSlug provided, narrow to that tenant
    let user;
    if (tenantSlug) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { slug: tenantSlug },
      });
      if (!tenant) {
        this.logger.warn(`Login failed: Tenant not found for slug: ${tenantSlug}`);
        throw new UnauthorizedException('Tenant not found');
      }
      user = await this.prisma.tenantUser.findUnique({
        where: {
          tenantId_email: { tenantId: tenant.id, email: normalizedEmail },
        },
        include: {
          tenant: { include: { onboarding: true } },
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: {
                    include: { permission: true },
                  },
                },
              },
            },
          },
        },
      });
    } else {
      // Find by email across tenants (first match)
      user = await this.prisma.tenantUser.findFirst({
        where: { email: normalizedEmail },
        include: {
          tenant: { include: { onboarding: true } },
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: {
                    include: { permission: true },
                  },
                },
              },
            },
          },
        },
      });
    }

    if (!user) {
      this.logger.warn(`Login failed: User not found for email: ${normalizedEmail}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      this.logger.warn(`Login failed: User is inactive: ${normalizedEmail}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    if ((user.tenant.status as string) !== (TenantStatus.ACTIVE as string) && 
        (user.tenant.status as string) !== (TenantStatus.TRIAL as string)) {
      throw new UnauthorizedException('Tenant is not active');
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      this.logger.warn(`Login failed: Invalid password for user: ${email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Build permissions from roles
    const roles = user.userRoles.map((ur) => ur.role?.slug).filter(Boolean);
    const permissions = [
      ...new Set(
        user.userRoles.flatMap((ur) =>
          ur.role?.rolePermissions.map((rp) => rp.permission?.slug) || [],
        ).filter(Boolean),
      ),
    ];

    // Generate tokens
    const payload: TenantJwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      type: 'tenant',
      email: user.email,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    this.logger.log(
      `Tenant user logged in: ${normalizedEmail} (tenant: ${user.tenant.slug})`,
    );

    return {
      accessToken,
      refreshToken,
      user: {
        userId: user.id,
        email: user.email,
        name: user.name,
        tenantId: user.tenantId,
        roles,
        permissions,
        tenant: {
          id: user.tenant.id,
          name: user.tenant.name,
          slug: user.tenant.slug,
          status: user.tenant.status,
        },
        onboardingCompletedAt: user.tenant.onboarding?.completedAt?.toISOString() || null,
      },
    };
  }

  /**
   * Register a new Tenant (SaaS Provisioning)
   */
  async register(
    ownerName: string,
    shopName: string,
    phone: string,
    email: string,
    passwordRaw: string,
  ) {
    const normalizedEmail = email.toLowerCase();
    
    // Validate if user email already exists across the system
    const existingUser = await this.prisma.tenantUser.findFirst({
      where: { email: normalizedEmail },
    });
    if (existingUser) {
      throw new UnauthorizedException('E-mail já está em uso.');
    }

    let slug = generateSlug(shopName);
    const existingTenant = await this.prisma.tenant.findUnique({ where: { slug } });
    if (existingTenant) {
      slug = `${slug}-${Math.floor(Math.random() * 1000)}`;
    }

    const passwordHash = await bcrypt.hash(passwordRaw, 10);

    // Run provisioning inside a transaction
    const user = await this.prisma.$transaction(async (tx) => {
      // Create Tenant
      const tenant = await tx.tenant.create({
        data: {
          name: shopName,
          slug,
          status: TenantStatus.ACTIVE,
          
          // Default modules
          onboarding: {
            create: {
              stepBasicInfo: false,
              stepOperatingHours: false,
              stepLogo: false,
              stepAddress: false,
              stepDelivery: false,
              stepPayments: false,
              stepWhatsapp: false,
              stepMenu: false,
              stepCatalog: false,
              stepFirstOrder: false,
            }
          },
          settings: {
            create: {}
          },
          aiAgentConfig: {
            create: {
              isEnabled: false,
              useGlobalDefaults: true,
              humanInterventionEnabled: true,
              humanInterventionMinutes: 15,
              resumeAutomatically: true,
            }
          },
          schedulingSettings: {
            create: {
              enabled: false,
              maximumAdvanceDays: 7,
              timezone: 'America/Sao_Paulo',
            }
          },
          users: {
            create: {
              name: ownerName,
              email: normalizedEmail,
              passwordHash,
              isActive: true,
            }
          }
        },
        include: {
          users: true,
        }
      });

      const createdUser = tenant.users[0];

      // Assign Owner Role
      let ownerRole = await tx.tenantRole.findFirst({ where: { slug: TenantDefaultRole.TENANT_OWNER, tenantId: tenant.id } });
      if (!ownerRole) {
         // Create default role if it doesn't exist
         ownerRole = await tx.tenantRole.create({
           data: { name: 'Dono', slug: TenantDefaultRole.TENANT_OWNER, tenantId: tenant.id, isSystem: true }
         });

         // Fetch all permissions and assign to owner
         const allPermissions = await tx.tenantPermission.findMany();
         if (allPermissions.length > 0) {
           await tx.tenantRolePermission.createMany({
             data: allPermissions.map(p => ({
               roleId: ownerRole.id,
               permissionId: p.id,
             }))
           });
         }
      }

      await tx.tenantUserRole.create({
        data: {
          userId: createdUser.id,
          roleId: ownerRole.id,
        }
      });

      // Load full user details to generate token
      return tx.tenantUser.findUniqueOrThrow({
        where: { id: createdUser.id },
        include: {
          tenant: { include: { onboarding: true } },
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: {
                    include: { permission: true },
                  },
                },
              },
            },
          },
        },
      });
    }, { timeout: 15000 });

    // Build permissions from roles
    const roles = user.userRoles.map((ur) => ur.role?.slug).filter(Boolean);
    const permissions = [
      ...new Set(
        user.userRoles.flatMap((ur) =>
          ur.role?.rolePermissions.map((rp) => rp.permission?.slug) || [],
        ).filter(Boolean),
      ),
    ];

    // Generate tokens
    const payload: TenantJwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      type: 'tenant',
      email: user.email,
    };

    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    this.logger.log(
      `New Tenant provisioned: ${slug} by ${normalizedEmail}`,
    );

    return {
      accessToken,
      refreshToken,
      user: {
        userId: user.id,
        email: user.email,
        name: user.name,
        tenantId: user.tenantId,
        roles,
        permissions,
        tenant: {
          id: user.tenant.id,
          name: user.tenant.name,
          slug: user.tenant.slug,
          status: user.tenant.status,
        },
        onboardingCompletedAt: user.tenant.onboarding?.completedAt?.toISOString() || null,
      },
    };
  }

  /**
   * Refresh the access token using a valid refresh token.
   */
  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<TenantJwtPayload>(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET', 'dev-refresh-secret'),
      });

      // Verify user still exists and is active using the isolated client
      const user = await this.prisma.tenantClient.tenantUser.findUnique({
        where: { id: payload.sub },
        include: { tenant: true },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('User no longer active');
      }

      const newPayload: TenantJwtPayload = {
        sub: user.id,
        tenantId: user.tenantId,
        type: 'tenant',
        email: user.email,
      };

      const newAccessToken = this.jwtService.sign(newPayload);

      return { accessToken: newAccessToken };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Load user session data (for /me endpoint).
   */
  async getSession(userId: string) {
    const user = await this.prisma.tenantClient.tenantUser.findUnique({
      where: { id: userId },
      include: {
        tenant: { include: { onboarding: true } },
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    const roles = user.userRoles
      .map((ur) => ur.role?.slug)
      .filter((slug): slug is string => typeof slug === 'string');

    const permissions = Array.from(
      new Set(
        user.userRoles.flatMap((ur) =>
          ur.role
            ? ur.role.rolePermissions.map((rp) => rp.permission.slug)
            : [],
        ),
      ),
    );

    return {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      name: user.name,
      roles,
      permissions,
      tenant: {
        id: user.tenant.id,
        name: user.tenant.name,
        slug: user.tenant.slug,
        status: user.tenant.status,
      },
      onboardingCompletedAt: user.tenant.onboarding?.completedAt?.toISOString() || null,
    };
  }

  /**
   * Generates a tenant token for support/impersonation purposes.
   * This should only be callable by Admin users with proper permissions.
   */
  async impersonate(tenantId: string, adminId: string, reason: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Find the first active owner or manager to impersonate
    const user = await this.prisma.tenantUser.findFirst({
      where: { tenantId, isActive: true },
    });

    if (!user) {
      throw new UnauthorizedException('No active user found in this tenant to impersonate');
    }

    const payload: TenantJwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      type: 'tenant',
      email: user.email,
      isImpersonated: true,
      impersonatedBy: adminId,
    };

    const accessToken = this.jwtService.sign(payload);

    // Log the impersonation action
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId: adminId,
        userType: 'admin',
        action: 'impersonation_start',
        resource: 'tenant',
        details: {
          impersonatedUserId: user.id,
          reason,
        },
      },
    });

    this.logger.log(`Admin ${adminId} impersonating tenant ${tenantId} (Reason: ${reason})`);

    return {
      accessToken,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
    };
  }
}
