import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class BusinessGroupService {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: { name: string; ownerId?: string }) {
    return this.prisma.businessGroup.create({
      data,
    });
  }

  async findById(id: string) {
    const group = await this.prisma.businessGroup.findUnique({
      where: { id },
      include: { tenants: true },
    });
    if (!group) throw new NotFoundException('Business Group not found');
    return group;
  }

  async addTenant(groupId: string, tenantId: string) {
    const group = await this.prisma.businessGroup.findUnique({
      where: { id: groupId },
      select: { headquartersTenantId: true },
    });

    if (!group) {
      throw new NotFoundException('Business Group not found');
    }

    const tenantRole = group.headquartersTenantId ? 'branch' : 'headquarters';

    return this.prisma.$transaction(async (tx) => {
      if (!group.headquartersTenantId) {
        await tx.businessGroup.update({
          where: { id: groupId },
          data: { headquartersTenantId: tenantId },
        });
      }

      return tx.tenant.update({
        where: { id: tenantId },
        data: {
          businessGroupId: groupId,
          businessGroupRole: tenantRole,
        },
      });
    });
  }

  async listAll() {
    return this.prisma.businessGroup.findMany({
      include: {
        _count: {
          select: { tenants: true },
        },
      },
    });
  }
}
