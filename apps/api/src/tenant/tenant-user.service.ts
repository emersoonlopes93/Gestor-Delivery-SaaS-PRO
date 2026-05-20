import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { CreateTenantUserDto } from './dto/create-tenant-user.dto';
import { UpdateTenantUserDto } from './dto/update-tenant-user.dto';

@Injectable()
export class TenantUserService {
  constructor(private readonly prisma: PrismaService) {}

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
    const existing = await this.prisma.tenantUser.findFirst({
      where: { tenantId, email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Este e-mail já está em uso neste estabelecimento');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.tenantUser.create({
        data: {
          tenantId,
          email: dto.email,
          name: dto.name,
          passwordHash,
          isActive: dto.isActive ?? true,
        },
      });

      if (dto.roles && dto.roles.length > 0) {
        const roles = await tx.tenantRole.findMany({
          where: {
            tenantId,
            slug: { in: dto.roles },
          },
        });

        if (roles.length > 0) {
          await tx.tenantUserRole.createMany({
            data: roles.map((role) => ({
              userId: user.id,
              roleId: role.id,
            })),
          });
        }
      }

      return user;
    });
  }

  async update(tenantId: string, id: string, dto: UpdateTenantUserDto) {
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
      const updatedUser = await tx.tenantUser.update({
        where: { id },
        data,
      });

      if (dto.roles !== undefined) {
        // Remove existing roles
        await tx.tenantUserRole.deleteMany({
          where: { userId: id },
        });

        // Add new roles
        if (dto.roles.length > 0) {
          const roles = await tx.tenantRole.findMany({
            where: {
              tenantId,
              slug: { in: dto.roles },
            },
          });

          await tx.tenantUserRole.createMany({
            data: roles.map((role) => ({
              userId: id,
              roleId: role.id,
            })),
          });
        }
      }

      return updatedUser;
    });
  }

  async delete(tenantId: string, id: string) {
    await this.findById(tenantId, id);
    return this.prisma.tenantUser.delete({
      where: { id },
    });
  }

  async getAvailableRoles(tenantId: string) {
    return this.prisma.tenantRole.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }
}
