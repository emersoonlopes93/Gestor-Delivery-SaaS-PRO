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

  // --- COMPATIBILITY MAPPER ---
  private mapProductToLegacyCombo(product: any) {
    return {
      id: product.id,
      tenantId: product.tenantId,
      name: product.name,
      slug: product.slug,
      description: product.shortDescription,
      basePrice: product.basePrice,
      image: product.image,
      isActive: product.publication?.publicationStatus === 'published',
      isFeatured: product.isFeatured,
      order: product.order,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      deletedAt: product.deletedAt,
      blocks: product.comboSlots ? product.comboSlots.map((slot: any) => this.mapSlotToLegacyBlock(slot)) : [],
    };
  }

  private mapSlotToLegacyBlock(slot: any) {
    return {
      id: slot.id,
      tenantId: slot.tenantId,
      comboId: slot.comboProductId,
      name: slot.name,
      description: slot.description,
      minSelect: slot.minSelect,
      maxSelect: slot.maxSelect,
      order: slot.order,
      createdAt: slot.createdAt,
      updatedAt: slot.updatedAt,
      items: slot.allowedItems ? slot.allowedItems.map((item: any) => this.mapAllowedItemToLegacyBlockItem(item)) : [],
    };
  }

  private mapAllowedItemToLegacyBlockItem(item: any) {
    return {
      id: item.id,
      tenantId: item.tenantId,
      blockId: item.comboSlotId,
      productId: item.productId,
      additionalPrice: item.additionalPrice,
      order: item.order,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      product: item.product,
    };
  }

  async create(createComboDto: CreateComboDto) {
    const tenantId = this.getRequiredTenantId();
    const slug = slugify(createComboDto.name);

    const comboExists = await this.prisma.tenantClient.product.findFirst({
      where: {
        tenantId,
        slug,
        type: 'combo',
        deletedAt: null,
      },
    });

    if (comboExists) {
      throw new ConflictException(`Já existe um combo com o nome "${createComboDto.name}".`);
    }

    const deletedComboConflict = await this.prisma.tenantClient.product.findFirst({
      where: {
        tenantId,
        slug,
        type: 'combo',
        NOT: { deletedAt: null },
      },
    });

    if (deletedComboConflict) {
      await this.prisma.tenantClient.product.update({
        where: { id: deletedComboConflict.id },
        data: { slug: `${slug}-deleted-${Date.now()}` },
      });
    }

    const product = await this.prisma.tenantClient.product.create({
      data: {
        tenantId,
        slug,
        name: createComboDto.name,
        shortDescription: createComboDto.description ?? null,
        basePrice: createComboDto.basePrice,
        image: createComboDto.image ?? null,
        isFeatured: createComboDto.isFeatured ?? false,
        order: createComboDto.order ?? 0,
        type: 'combo',
        comboMode: 'bundle',
        comboPricingType: 'fixed_price',
        comboPricingValue: createComboDto.basePrice,
        isAvailable: true,
        sellableOnline: true,
        publication: {
          create: {
            tenantId,
            publicationStatus: createComboDto.isActive ? 'published' : 'draft',
            operationalStatus: 'active',
          }
        }
      },
      include: { publication: true }
    });

    return this.mapProductToLegacyCombo(product);
  }

  async findAll() {
    const tenantId = this.getRequiredTenantId();
    const products = await this.prisma.tenantClient.product.findMany({
      where: { tenantId, type: 'combo', deletedAt: null },
      orderBy: { order: 'asc' },
      include: { 
        publication: true,
        comboSlots: { include: { allowedItems: { include: { product: true } } } } 
      },
    });
    return products.map(p => this.mapProductToLegacyCombo(p));
  }

  async findOne(id: string) {
    const tenantId = this.getRequiredTenantId();
    const combo = await this.prisma.tenantClient.product.findFirst({
      where: { id, tenantId, type: 'combo', deletedAt: null },
      include: { 
        publication: true,
        comboSlots: { include: { allowedItems: { include: { product: true } } } } 
      },
    });

    if (!combo) {
      throw new NotFoundException(`Combo não encontrado.`);
    }

    return this.mapProductToLegacyCombo(combo);
  }

  async update(id: string, updateComboDto: UpdateComboDto) {
    const tenantId = this.getRequiredTenantId();
    const existing = await this.prisma.tenantClient.product.findFirst({
      where: { id, tenantId, type: 'combo', deletedAt: null }
    });
    
    if (!existing) {
      throw new NotFoundException(`Combo não encontrado.`);
    }

    const slug = updateComboDto.name ? slugify(updateComboDto.name) : undefined;

    const updated = await this.prisma.tenantClient.product.update({
      where: { id },
      data: {
        name: updateComboDto.name,
        shortDescription: updateComboDto.description ?? undefined,
        basePrice: updateComboDto.basePrice,
        image: updateComboDto.image ?? undefined,
        isFeatured: updateComboDto.isFeatured,
        order: updateComboDto.order,
        ...(slug ? { slug } : {}),
        ...(updateComboDto.basePrice !== undefined ? { comboPricingValue: updateComboDto.basePrice } : {}),
        publication: updateComboDto.isActive !== undefined ? {
          update: {
            publicationStatus: updateComboDto.isActive ? 'published' : 'draft'
          }
        } : undefined
      },
      include: { publication: true, comboSlots: { include: { allowedItems: { include: { product: true } } } } }
    });
    
    return this.mapProductToLegacyCombo(updated);
  }

  async remove(id: string) {
    const tenantId = this.getRequiredTenantId();
    const combo = await this.prisma.tenantClient.product.findFirst({
      where: { id, tenantId, type: 'combo', deletedAt: null }
    });

    if (!combo) {
      throw new NotFoundException(`Combo não encontrado.`);
    }

    const timestamp = Date.now();
    const deleted = await this.prisma.tenantClient.product.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        slug: `${combo.slug}-deleted-${timestamp}`,
      },
      include: { publication: true, comboSlots: { include: { allowedItems: { include: { product: true } } } } }
    });
    
    return this.mapProductToLegacyCombo(deleted);
  }

  private async ensureComboExists(comboId: string) {
    const combo = await this.prisma.tenantClient.product.findFirst({
      where: { id: comboId, type: 'combo', deletedAt: null },
      select: { id: true },
    });

    if (!combo) {
      throw new NotFoundException('Combo não encontrado.');
    }

    return combo;
  }

  private async ensureBlockBelongsToCombo(comboId: string, blockId: string) {
    const block = await this.prisma.tenantClient.comboSlot.findFirst({
      where: { id: blockId, comboProductId: comboId },
      select: { id: true, comboProductId: true },
    });

    if (!block) {
      throw new NotFoundException('Bloco não encontrado para este combo.');
    }

    return block;
  }

  private async ensureItemBelongsToBlock(blockId: string, itemId: string) {
    const item = await this.prisma.tenantClient.comboSlotAllowedItem.findFirst({
      where: { id: itemId, comboSlotId: blockId },
      select: { id: true, comboSlotId: true },
    });

    if (!item) {
      throw new NotFoundException('Item não encontrado para este bloco.');
    }

    return item;
  }

  async createBlock(dto: CreateComboBlockDto) {
    await this.ensureComboExists(dto.comboId);
    const tenantId = this.getRequiredTenantId();

    const slot = await this.prisma.tenantClient.comboSlot.create({
      data: {
        tenantId,
        comboProductId: dto.comboId,
        name: dto.name,
        description: dto.description ?? null,
        isRequired: (dto.minSelect ?? 1) > 0,
        minSelect: dto.minSelect ?? 1,
        maxSelect: dto.maxSelect ?? 1,
        order: dto.order ?? 0,
      },
      include: { allowedItems: { include: { product: true } } },
    });
    
    return this.mapSlotToLegacyBlock(slot);
  }

  async listBlocks(comboId: string) {
    await this.ensureComboExists(comboId);

    const slots = await this.prisma.tenantClient.comboSlot.findMany({
      where: { comboProductId: comboId },
      orderBy: { order: 'asc' },
      include: { allowedItems: { include: { product: true } } },
    });
    
    return slots.map(s => this.mapSlotToLegacyBlock(s));
  }

  async updateBlock(comboId: string, blockId: string, dto: UpdateComboBlockDto) {
    await this.ensureComboExists(comboId);
    await this.ensureBlockBelongsToCombo(comboId, blockId);

    const slot = await this.prisma.tenantClient.comboSlot.update({
      where: { id: blockId },
      data: {
        name: dto.name,
        description: dto.description ?? undefined,
        minSelect: dto.minSelect,
        maxSelect: dto.maxSelect,
        isRequired: dto.minSelect !== undefined ? dto.minSelect > 0 : undefined,
        order: dto.order,
      },
      include: { allowedItems: { include: { product: true } } },
    });
    
    return this.mapSlotToLegacyBlock(slot);
  }

  async removeBlock(comboId: string, blockId: string) {
    await this.ensureComboExists(comboId);
    await this.ensureBlockBelongsToCombo(comboId, blockId);

    const deleted = await this.prisma.tenantClient.comboSlot.delete({
      where: { id: blockId },
    });
    
    return this.mapSlotToLegacyBlock(deleted);
  }

  async createBlockItem(comboId: string, dto: CreateComboBlockItemDto) {
    await this.ensureComboExists(comboId);
    await this.ensureBlockBelongsToCombo(comboId, dto.blockId);
    const tenantId = this.getRequiredTenantId();

    try {
      const item = await this.prisma.tenantClient.comboSlotAllowedItem.create({
        data: {
          tenantId,
          comboSlotId: dto.blockId,
          productId: dto.productId,
          additionalPrice: dto.additionalPrice ?? 0,
          order: dto.order ?? 0,
        },
        include: { product: true },
      });
      return this.mapAllowedItemToLegacyBlockItem(item);
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

    const items = await this.prisma.tenantClient.comboSlotAllowedItem.findMany({
      where: { comboSlotId: blockId },
      orderBy: { order: 'asc' },
      include: { product: true },
    });
    
    return items.map(i => this.mapAllowedItemToLegacyBlockItem(i));
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
      const item = await this.prisma.tenantClient.comboSlotAllowedItem.update({
        where: { id: itemId },
        data: {
          productId: dto.productId,
          additionalPrice: dto.additionalPrice,
          order: dto.order,
        },
        include: { product: true },
      });
      return this.mapAllowedItemToLegacyBlockItem(item);
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

    const deleted = await this.prisma.tenantClient.comboSlotAllowedItem.delete({
      where: { id: itemId },
    });
    return this.mapAllowedItemToLegacyBlockItem(deleted);
  }
}
