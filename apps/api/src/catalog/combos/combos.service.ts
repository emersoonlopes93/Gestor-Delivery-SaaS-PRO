import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../../common/context/tenant-context.service';
import { CreateComboDto } from './dto/create-combo.dto';
import { UpdateComboDto } from './dto/update-combo.dto';
import { slugify } from '@gestor/utils';

@Injectable()
export class CombosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private getRequiredTenantId(): string {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) {
      throw new NotFoundException('Tenant context não encontrado');
    }
    return tenantId;
  }

  async create(createComboDto: CreateComboDto) {
    const tenantId = this.getRequiredTenantId();
    const slug = slugify(createComboDto.name);

    return this.prisma.tenantClient.productCombo.create({
      data: {
        tenantId,
        slug,
        name: createComboDto.name,
        description: createComboDto.description ?? null,
        basePrice: createComboDto.basePrice,
        image: createComboDto.image ?? null,
        isActive: createComboDto.isActive ?? true,
        isFeatured: createComboDto.isFeatured ?? false,
        order: createComboDto.order ?? 0,
      },
    });
  }

  async findAll() {
    return this.prisma.tenantClient.productCombo.findMany({
      where: { deletedAt: null },
      orderBy: { order: 'asc' },
      include: { blocks: { include: { items: true } } },
    });
  }

  async findOne(id: string) {
    const combo = await this.prisma.tenantClient.productCombo.findFirst({
      where: { id, deletedAt: null },
      include: { blocks: { include: { items: { include: { product: true } } } } },
    });

    if (!combo) {
      throw new NotFoundException(`Combo não encontrado.`);
    }

    return combo;
  }

  async update(id: string, updateComboDto: UpdateComboDto) {
    await this.findOne(id);

    const slug = updateComboDto.name ? slugify(updateComboDto.name) : undefined;

    return this.prisma.tenantClient.productCombo.update({
      where: { id },
      data: {
        name: updateComboDto.name,
        description: updateComboDto.description ?? undefined,
        basePrice: updateComboDto.basePrice,
        image: updateComboDto.image ?? undefined,
        isActive: updateComboDto.isActive,
        isFeatured: updateComboDto.isFeatured,
        order: updateComboDto.order,
        ...(slug ? { slug } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    // Soft delete
    return this.prisma.tenantClient.productCombo.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
