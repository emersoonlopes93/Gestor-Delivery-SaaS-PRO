import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { TenantContextService } from '../../common/context/tenant-context.service';
import { CreateComboSlotDto } from './dto/create-combo-slot.dto';
import { UpdateComboSlotDto } from './dto/update-combo-slot.dto';
import { CreateComboSlotAllowedItemDto } from './dto/create-combo-slot-allowed-item.dto';
import { UpdateComboSlotAllowedItemDto } from './dto/update-combo-slot-allowed-item.dto';

@Injectable()
export class ComboSlotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  private getRequiredTenantId(): string {
    const tenantId = this.tenantContext.getTenantId();
    if (!tenantId) throw new NotFoundException('Tenant context não encontrado');
    return tenantId;
  }

  private validateSlotRules(input: { isRequired: boolean; minSelect: number; maxSelect: number }) {
    const minSelect = Math.max(0, Number(input.minSelect ?? 0));
    const maxSelect = Math.max(0, Number(input.maxSelect ?? 0));
    const effectiveMin = input.isRequired ? Math.max(1, minSelect) : minSelect;

    if (maxSelect === 0) {
      throw new BadRequestException('maxSelect deve ser maior que 0.');
    }

    if (effectiveMin > maxSelect) {
      throw new BadRequestException('minSelect não pode ser maior que maxSelect.');
    }
  }

  private async ensureComboProduct(tenantId: string, comboProductId: string) {
    const product = await this.prisma.tenantClient.product.findFirst({
      where: { id: comboProductId, tenantId, deletedAt: null },
      select: { id: true, type: true },
    });
    if (!product) throw new NotFoundException('Produto combo não encontrado.');
    if (product.type !== 'combo') {
      throw new BadRequestException('O produto informado não é do tipo combo.');
    }
    return product;
  }

  async createSlot(dto: CreateComboSlotDto) {
    const tenantId = this.getRequiredTenantId();
    await this.ensureComboProduct(tenantId, dto.comboProductId);

    const isRequired = dto.isRequired ?? true;
    const minSelect = dto.minSelect ?? 1;
    const maxSelect = dto.maxSelect ?? 1;

    this.validateSlotRules({ isRequired, minSelect, maxSelect });

    return this.prisma.tenantClient.comboSlot.create({
      data: {
        tenantId,
        comboProductId: dto.comboProductId,
        name: dto.name,
        description: dto.description ?? null,
        isRequired,
        minSelect,
        maxSelect,
        order: dto.order ?? 0,
      } satisfies Prisma.ComboSlotUncheckedCreateInput,
      include: { allowedItems: { orderBy: { order: 'asc' }, include: { product: true } } },
    });
  }

  async listSlotsByComboProduct(comboProductId: string) {
    const tenantId = this.getRequiredTenantId();
    await this.ensureComboProduct(tenantId, comboProductId);

    return this.prisma.tenantClient.comboSlot.findMany({
      where: { tenantId, comboProductId },
      orderBy: { order: 'asc' },
      include: { allowedItems: { orderBy: { order: 'asc' }, include: { product: true } } },
    });
  }

  async updateSlot(slotId: string, dto: UpdateComboSlotDto) {
    const slot = await this.prisma.tenantClient.comboSlot.findFirst({
      where: { id: slotId },
      select: { id: true, comboProductId: true, isRequired: true, minSelect: true, maxSelect: true },
    });
    if (!slot) throw new NotFoundException('Slot não encontrado.');

    const isRequired = dto.isRequired ?? slot.isRequired;
    const minSelect = dto.minSelect ?? slot.minSelect;
    const maxSelect = dto.maxSelect ?? slot.maxSelect;

    this.validateSlotRules({ isRequired, minSelect, maxSelect });

    return this.prisma.tenantClient.comboSlot.update({
      where: { id: slotId },
      data: {
        name: dto.name,
        description: dto.description ?? undefined,
        isRequired: dto.isRequired,
        minSelect: dto.minSelect,
        maxSelect: dto.maxSelect,
        order: dto.order,
      },
      include: { allowedItems: { orderBy: { order: 'asc' }, include: { product: true } } },
    });
  }

  async deleteSlot(slotId: string) {
    const slot = await this.prisma.tenantClient.comboSlot.findFirst({
      where: { id: slotId },
      select: { id: true },
    });
    if (!slot) throw new NotFoundException('Slot não encontrado.');

    return this.prisma.tenantClient.comboSlot.delete({
      where: { id: slotId },
    });
  }

  async reorderSlots(comboProductId: string, orderedSlotIds: string[]) {
    const tenantId = this.getRequiredTenantId();
    await this.ensureComboProduct(tenantId, comboProductId);

    const slots = await this.prisma.tenantClient.comboSlot.findMany({
      where: { tenantId, comboProductId },
      select: { id: true },
    });

    const slotIds = new Set(slots.map((s) => s.id));

    for (const id of orderedSlotIds) {
      if (!slotIds.has(id)) {
        throw new BadRequestException('Lista de ordenação contém slot inválido.');
      }
    }

    if (orderedSlotIds.length !== slots.length) {
      throw new BadRequestException('Lista de ordenação incompleta.');
    }

    await this.prisma.$transaction(
      orderedSlotIds.map((id, idx) =>
        this.prisma.tenantClient.comboSlot.update({
          where: { id },
          data: { order: idx },
        }),
      ),
    );

    return this.listSlotsByComboProduct(comboProductId);
  }

  async addAllowedItem(dto: CreateComboSlotAllowedItemDto) {
    const tenantId = this.getRequiredTenantId();

    const slot = await this.prisma.tenantClient.comboSlot.findFirst({
      where: { id: dto.comboSlotId, tenantId },
      select: { id: true, comboProductId: true },
    });

    if (!slot) throw new NotFoundException('Slot não encontrado.');

    const product = await this.prisma.tenantClient.product.findFirst({
      where: { id: dto.productId, tenantId, deletedAt: null },
      select: { id: true, type: true, isActive: true },
    });

    if (!product) throw new NotFoundException('Produto permitido não encontrado.');

    if (product.type === 'combo') {
      throw new BadRequestException('Um combo não pode ser item permitido de outro combo.');
    }

    if (Number(dto.additionalPrice ?? 0) < 0) {
      throw new BadRequestException('additionalPrice não pode ser negativo.');
    }

    try {
      return await this.prisma.tenantClient.comboSlotAllowedItem.create({
        data: {
          tenantId,
          comboSlotId: dto.comboSlotId,
          productId: dto.productId,
          additionalPrice: dto.additionalPrice ?? 0,
          order: dto.order ?? 0,
        } satisfies Prisma.ComboSlotAllowedItemUncheckedCreateInput,
        include: { product: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002') {
          throw new ConflictException('Este produto já está permitido neste slot.');
        }
      }
      throw err;
    }
  }

  async updateAllowedItem(id: string, dto: UpdateComboSlotAllowedItemDto) {
    const allowed = await this.prisma.tenantClient.comboSlotAllowedItem.findFirst({
      where: { id },
      select: { id: true, comboSlotId: true, productId: true },
    });

    if (!allowed) throw new NotFoundException('Item permitido não encontrado.');

    if (dto.additionalPrice != null && Number(dto.additionalPrice) < 0) {
      throw new BadRequestException('additionalPrice não pode ser negativo.');
    }

    if (dto.productId) {
      const tenantId = this.getRequiredTenantId();
      const product = await this.prisma.tenantClient.product.findFirst({
        where: { id: dto.productId, tenantId, deletedAt: null },
        select: { id: true, type: true },
      });
      if (!product) throw new NotFoundException('Produto não encontrado.');
      if (product.type === 'combo') {
        throw new BadRequestException('Um combo não pode ser item permitido de outro combo.');
      }
    }

    try {
      return await this.prisma.tenantClient.comboSlotAllowedItem.update({
        where: { id },
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
          throw new ConflictException('Este produto já está permitido neste slot.');
        }
      }
      throw err;
    }
  }

  async deleteAllowedItem(id: string) {
    const allowed = await this.prisma.tenantClient.comboSlotAllowedItem.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!allowed) throw new NotFoundException('Item permitido não encontrado.');

    return this.prisma.tenantClient.comboSlotAllowedItem.delete({
      where: { id },
    });
  }

  async reorderAllowedItems(comboSlotId: string, orderedAllowedItemIds: string[]) {
    const tenantId = this.getRequiredTenantId();

    const allowedItems = await this.prisma.tenantClient.comboSlotAllowedItem.findMany({
      where: { tenantId, comboSlotId },
      select: { id: true },
    });

    const allowedIds = new Set(allowedItems.map((a) => a.id));

    for (const id of orderedAllowedItemIds) {
      if (!allowedIds.has(id)) {
        throw new BadRequestException('Lista de ordenação contém item permitido inválido.');
      }
    }

    if (orderedAllowedItemIds.length !== allowedItems.length) {
      throw new BadRequestException('Lista de ordenação incompleta.');
    }

    await this.prisma.$transaction(
      orderedAllowedItemIds.map((id, idx) =>
        this.prisma.tenantClient.comboSlotAllowedItem.update({
          where: { id },
          data: { order: idx },
        }),
      ),
    );

    return this.prisma.tenantClient.comboSlotAllowedItem.findMany({
      where: { tenantId, comboSlotId },
      orderBy: { order: 'asc' },
      include: { product: true },
    });
  }
}
