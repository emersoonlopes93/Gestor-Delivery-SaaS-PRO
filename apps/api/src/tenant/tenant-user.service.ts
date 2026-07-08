import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { CreateTenantUserDto } from './dto/create-tenant-user.dto';
import { UpdateTenantUserDto } from './dto/update-tenant-user.dto';
import { TenantDefaultRole } from '@gestor/core';
import {
  ensureDefaultTenantRoles,
  getTenantRolePolicy,
} from './default-tenant-roles';

@Injectable()
export class TenantUserService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly ownerConfirmationToken = 'DONO';

  private mapRole(role: {
    id: string;
    tenantId: string;
    name: string;
    slug: string;
    description: string | null;
    isSystem: boolean;
    rolePermissions?: { permission: { slug: string } }[];
  }) {
    const policy = getTenantRolePolicy(role.slug);
    const permissions = role.rolePermissions?.map((item) => item.permission.slug) ?? [];

    return {
      id: role.id,
      tenantId: role.tenantId,
      name: role.name,
      slug: role.slug,
      description: role.description ?? policy.description,
      isSystem: role.isSystem,
      permissions,
      protected: policy.protected,
      assignable: policy.assignable,
      requiresStrongConfirmation: policy.requiresStrongConfirmation,
      suggestedForNewUsers: policy.suggestedForNewUsers,
    };
  }

  private async getActorRoleSlugs(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId?: string,
  ) {
    if (!actorUserId) {
      throw new ForbiddenException('Usuario autenticado obrigatorio para gerenciar funcionarios');
    }

    const actor = await tx.tenantUser.findFirst({
      where: { id: actorUserId, tenantId, isActive: true },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });

    if (!actor) {
      throw new ForbiddenException('Usuario autenticado nao encontrado neste tenant');
    }

    return actor.userRoles
      .map((userRole) => userRole.role?.slug)
      .filter((slug): slug is string => typeof slug === 'string');
  }

  private async validateRequestedRoles(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string,
    requestedRoleSlugs: string[],
    ownerConfirmationText?: string,
  ) {
    const uniqueRoleSlugs = Array.from(new Set(requestedRoleSlugs));
    if (uniqueRoleSlugs.length === 0) {
      throw new BadRequestException('Selecione pelo menos um cargo');
    }

    const roles = await tx.tenantRole.findMany({
      where: {
        tenantId,
        slug: { in: uniqueRoleSlugs },
      },
      include: {
        rolePermissions: {
          include: { permission: true },
        },
      },
    });

    if (roles.length !== uniqueRoleSlugs.length) {
      throw new BadRequestException('Um ou mais cargos informados sao invalidos para este tenant');
    }

    const actorRoles = await this.getActorRoleSlugs(tx, tenantId, actorUserId);
    const actorIsOwner = actorRoles.includes(TenantDefaultRole.TENANT_OWNER);
    const ownerRequested = uniqueRoleSlugs.includes(TenantDefaultRole.TENANT_OWNER);

    for (const role of roles) {
      const policy = getTenantRolePolicy(role.slug);
      if (!policy.assignable) {
        throw new ForbiddenException(`O cargo ${role.name} nao pode ser atribuido manualmente`);
      }
    }

    if (ownerRequested) {
      if (!actorIsOwner) {
        throw new ForbiddenException('Somente um Dono pode atribuir o cargo Dono');
      }

      if ((ownerConfirmationText ?? '').trim().toUpperCase() !== this.ownerConfirmationToken) {
        throw new BadRequestException('A atribuicao de Dono exige confirmacao explicita');
      }
    }

    return roles;
  }

  private async countActiveOwners(
    tx: Prisma.TransactionClient,
    tenantId: string,
    excludeUserId?: string,
  ) {
    const owners = await tx.tenantUser.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
        userRoles: {
          some: {
            role: {
              slug: TenantDefaultRole.TENANT_OWNER,
            },
          },
        },
      },
      select: { id: true },
    });

    return owners.length;
  }

  async findAll(tenantId: string) {
    return this.prisma.tenantUser.findMany({
      where: { tenantId },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findById(tenantId: string, id: string) {
    const user = await this.prisma.tenantUser.findFirst({
      where: { id, tenantId },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    return user;
  }

  async create(tenantId: string, dto: CreateTenantUserDto) {
    return this.createWithActor(tenantId, dto, dto.actorUserId);
  }

  async createWithActor(tenantId: string, dto: CreateTenantUserDto, actorUserId?: string) {
    await ensureDefaultTenantRoles(this.prisma, tenantId);

    const existing = await this.prisma.tenantUser.findFirst({
      where: { tenantId, email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Este e-mail já está em uso neste estabelecimento');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const roles = await this.validateRequestedRoles(
        tx,
        tenantId,
        actorUserId,
        dto.roles,
        dto.ownerConfirmationText,
      );

      const user = await tx.tenantUser.create({
        data: {
          tenantId,
          email: dto.email,
          name: dto.name,
          passwordHash,
          isActive: dto.isActive ?? true,
        },
      });

      await tx.tenantUserRole.createMany({
        data: roles.map((role) => ({
          userId: user.id,
          roleId: role.id,
        })),
      });

      const assignedRoleSlugs = roles.map((role) => role.slug);
      const ownerAssigned = assignedRoleSlugs.includes(TenantDefaultRole.TENANT_OWNER);

      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actorUserId,
          userType: 'tenant_user',
          action: 'tenant.user.create',
          resource: 'tenant_user',
          details: {
            createdUserId: user.id,
            createdEmail: user.email,
            roles: assignedRoleSlugs,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actorUserId,
          userType: 'tenant_user',
          action: 'tenant.user.role.assign',
          resource: 'tenant_user',
          details: {
            createdUserId: user.id,
            roles: assignedRoleSlugs,
          },
        },
      });

      if (ownerAssigned) {
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: actorUserId,
            userType: 'tenant_user',
            action: 'tenant.user.owner.assign',
            resource: 'tenant_user',
            details: {
              createdUserId: user.id,
            },
          },
        });
      }

      return user;
    });
  }

  async update(tenantId: string, id: string, dto: UpdateTenantUserDto) {
    return this.updateWithActor(tenantId, id, dto, dto.actorUserId);
  }

  async updateWithActor(
    tenantId: string,
    id: string,
    dto: UpdateTenantUserDto,
    actorUserId?: string,
  ) {
    await ensureDefaultTenantRoles(this.prisma, tenantId);
    await this.findById(tenantId, id);

    const data: Prisma.TenantUserUpdateInput = {
      name: dto.name,
      email: dto.email,
      isActive: dto.isActive,
    };

    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 12);
    }

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existingUser = await tx.tenantUser.findFirstOrThrow({
        where: { id, tenantId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });

      const currentRoleSlugs = existingUser.userRoles
        .map((userRole) => userRole.role?.slug)
        .filter((slug): slug is string => typeof slug === 'string');
      const currentlyOwner = currentRoleSlugs.includes(TenantDefaultRole.TENANT_OWNER);

      let validatedRoles:
        | Awaited<ReturnType<TenantUserService['validateRequestedRoles']>>
        | undefined;
      let nextRoleSlugs = currentRoleSlugs;

      if (dto.roles !== undefined) {
        validatedRoles = await this.validateRequestedRoles(
          tx,
          tenantId,
          actorUserId,
          dto.roles,
          dto.ownerConfirmationText,
        );
        nextRoleSlugs = validatedRoles.map((role) => role.slug);
      }

      const remainsOwner = nextRoleSlugs.includes(TenantDefaultRole.TENANT_OWNER);
      const deactivatingLastOwner = currentlyOwner && dto.isActive === false;
      const removingOwnerRole = currentlyOwner && dto.roles !== undefined && !remainsOwner;

      if ((deactivatingLastOwner || removingOwnerRole) && (await this.countActiveOwners(tx, tenantId, id)) === 0) {
        throw new BadRequestException('Nao e permitido remover ou desativar o ultimo Dono do tenant');
      }

      const updatedUser = await tx.tenantUser.update({
        where: { id },
        data,
      });

      if (dto.roles !== undefined) {
        await tx.tenantUserRole.deleteMany({
          where: { userId: id },
        });

        if (validatedRoles && validatedRoles.length > 0) {
          await tx.tenantUserRole.createMany({
            data: validatedRoles.map((role) => ({
              userId: id,
              roleId: role.id,
            })),
          });
        }

        await tx.auditLog.create({
          data: {
            tenantId,
            userId: actorUserId,
            userType: 'tenant_user',
            action: 'tenant.user.role.assign',
            resource: 'tenant_user',
            details: {
              targetUserId: id,
              previousRoles: currentRoleSlugs,
              nextRoles: nextRoleSlugs,
            },
          },
        });

        if (currentlyOwner && !remainsOwner) {
          await tx.auditLog.create({
            data: {
              tenantId,
              userId: actorUserId,
              userType: 'tenant_user',
              action: 'tenant.user.role.remove',
              resource: 'tenant_user',
              details: {
                targetUserId: id,
                removedRole: TenantDefaultRole.TENANT_OWNER,
              },
            },
          });
        }

        if (!currentlyOwner && remainsOwner) {
          await tx.auditLog.create({
            data: {
              tenantId,
              userId: actorUserId,
              userType: 'tenant_user',
              action: 'tenant.user.owner.assign',
              resource: 'tenant_user',
              details: {
                targetUserId: id,
              },
            },
          });
        }
      }

      if (existingUser.isActive && dto.isActive === false) {
        await tx.auditLog.create({
          data: {
            tenantId,
            userId: actorUserId,
            userType: 'tenant_user',
            action: 'tenant.user.disable',
            resource: 'tenant_user',
            details: {
              targetUserId: id,
            },
          },
        });
      }

      return updatedUser;
    });
  }

  async delete(tenantId: string, id: string) {
    return this.deleteWithActor(tenantId, id);
  }

  async deleteWithActor(tenantId: string, id: string, actorUserId?: string) {
    await this.findById(tenantId, id);
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existingUser = await tx.tenantUser.findFirstOrThrow({
        where: { id, tenantId },
        include: {
          userRoles: {
            include: { role: true },
          },
        },
      });

      const isOwner = existingUser.userRoles.some(
        (userRole) => userRole.role?.slug === TenantDefaultRole.TENANT_OWNER,
      );

      if (isOwner && (await this.countActiveOwners(tx, tenantId, id)) === 0) {
        throw new BadRequestException('Nao e permitido remover o ultimo Dono do tenant');
      }

      const deletedUser = await tx.tenantUser.delete({
        where: { id },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actorUserId,
          userType: 'tenant_user',
          action: 'tenant.user.disable',
          resource: 'tenant_user',
          details: {
            targetUserId: id,
            deleted: true,
          },
        },
      });

      return deletedUser;
    });
  }

  async getAvailableRoles(tenantId: string) {
    await ensureDefaultTenantRoles(this.prisma, tenantId);

    const roles = await this.prisma.tenantRole.findMany({
      where: { tenantId },
      include: {
        rolePermissions: {
          include: { permission: true },
        },
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });

    return roles.map((role) => this.mapRole(role));
  }
}
