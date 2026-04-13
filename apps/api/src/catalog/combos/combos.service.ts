import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../../common/context/tenant-context.service';
import { CreateComboBlockDto, CreateComboBlockItemDto, CreateComboDto } from './dto/create-combo.dto';
import { UpdateComboBlockDto, UpdateComboBlockItemDto, UpdateComboDto } from './dto/update-combo.dto';
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

  private async ensureComboExists(comboId: string) {
    const combo = await this.prisma.tenantClient.productCombo.findFirst({
      where: { id: comboId, deletedAt: null },
      select: { id: true },
    });

    if (!combo) {
      throw new NotFoundException('Combo não encontrado.');
    }

    return combo;
  }

  private async ensureBlockBelongsToCombo(comboId: string, blockId: string) {
    const block = await this.prisma.tenantClient.productComboBlock.findFirst({
      where: { id: blockId, comboId },
      select: { id: true, comboId: true },
    });

    if (!block) {
      throw new NotFoundException('Bloco não encontrado para este combo.');
    }

    return block;
  }

  private async ensureItemBelongsToBlock(blockId: string, itemId: string) {
    const item = await this.prisma.tenantClient.productComboBlockItem.findFirst({
      where: { id: itemId, blockId },
      select: { id: true, blockId: true },
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado para este bloco.');
    }

    return item;
  }

  async createBlock(dto: CreateComboBlockDto) {
    await this.ensureComboExists(dto.comboId);

    const tenantId = this.getRequiredTenantId();

    return this.prisma.tenantClient.productComboBlock.create({
      data: {
        tenantId,
        comboId: dto.comboId,
        name: dto.name,
        description: dto.description ?? null,
        minSelect: dto.minSelect ?? 1,
        maxSelect: dto.maxSelect ?? 1,
        order: dto.order ?? 0,
      },
      include: { items: { include: { product: true } } },
    });
  }

  async listBlocks(comboId: string) {
    await this.ensureComboExists(comboId);

    return this.prisma.tenantClient.productComboBlock.findMany({
      where: { comboId },
      orderBy: { order: 'asc' },
      include: { items: { include: { product: true } } },
    });
  }

  async updateBlock(comboId: string, blockId: string, dto: UpdateComboBlockDto) {
    await this.ensureComboExists(comboId);
    await this.ensureBlockBelongsToCombo(comboId, blockId);

    return this.prisma.tenantClient.productComboBlock.update({
      where: { id: blockId },
      data: {
        name: dto.name,
        description: dto.description ?? undefined,
        minSelect: dto.minSelect,
        maxSelect: dto.maxSelect,
        order: dto.order,
      },
      include: { items: { include: { product: true } } },
    });
  }

  async removeBlock(comboId: string, blockId: string) {
    await this.ensureComboExists(comboId);
    await this.ensureBlockBelongsToCombo(comboId, blockId);

    return this.prisma.tenantClient.productComboBlock.delete({
      where: { id: blockId },
    });
  }

  async createBlockItem(comboId: string, dto: CreateComboBlockItemDto) {
    await this.ensureComboExists(comboId);
    await this.ensureBlockBelongsToCombo(comboId, dto.blockId);

    const tenantId = this.getRequiredTenantId();

    try {
      return await this.prisma.tenantClient.productComboBlockItem.create({
        data: {
          tenantId,
          blockId: dto.blockId,
          productId: dto.productId,
          additionalPrice: dto.additionalPrice ?? 0,
          order: dto.order ?? 0,
        },
        include: { product: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          throw new ConflictException('Este produto já existe neste bloco.');
        }
      }

      throw err;
    }
  }

  async listBlockItems(comboId: string, blockId: string) {
    await this.ensureComboExists(comboId);
    await this.ensureBlockBelongsToCombo(comboId, blockId);

    return this.prisma.tenantClient.productComboBlockItem.findMany({
      where: { blockId },
      orderBy: { order: 'asc' },
      include: { product: true },
    });
  }

  async updateBlockItem(
    comboId: string,
    blockId: string,
    itemId: string,
    dto: UpdateComboBlockItemDto,
  ) {
    await this.ensureComboExists(comboId);
    await this.ensureBlockBelongsToCombo(comboId, blockId);
    await this.ensureItemBelongsToBlock(blockId, itemId);

    if (dto.productId === '') {
      throw new BadRequestException('productId inválido');
    }

    try {
      return await this.prisma.tenantClient.productComboBlockItem.update({
        where: { id: itemId },
        data: {
          productId: dto.productId,
          additionalPrice: dto.additionalPrice,
          order: dto.order,
        },
        include: { product: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          throw new ConflictException('Este produto já existe neste bloco.');
        }
      }

      throw err;
    }
  }

  async removeBlockItem(comboId: string, blockId: string, itemId: string) {
    await this.ensureComboExists(comboId);
    await this.ensureBlockBelongsToCombo(comboId, blockId);
    await this.ensureItemBelongsToBlock(blockId, itemId);

    return this.prisma.tenantClient.productComboBlockItem.delete({
      where: { id: itemId },
    });
  }
}
